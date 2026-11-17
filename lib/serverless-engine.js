'use strict';

const crypto = require('crypto');
const store = require('./redis-store');
const { QUESTIONS } = require('../public/js/questions');

const MILHAO_LABELS = [
  '1 MIL', '2 MIL', '3 MIL', '4 MIL', '5 MIL',
  '10 MIL', '20 MIL', '30 MIL', '40 MIL', '50 MIL',
  '100 MIL', '200 MIL', '300 MIL', '400 MIL', '500 MIL',
  '1 MILHÃO!'
];

const QUESTION_MAP = new Map(QUESTIONS.map((q) => [q.id, q]));

function keyMeta(pin) {
  return `arena:room:${pin}:meta`;
}
function keyPlayers(pin) {
  return `arena:room:${pin}:players`;
}
function keyLifelines(pin) {
  return `arena:room:${pin}:lifelines`;
}
function keyAnswers(pin, roundId) {
  return `arena:room:${pin}:answers:${roundId}`;
}
function keyRevealLock(pin, roundId) {
  return `arena:room:${pin}:reveal_lock:${roundId}`;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function selectQuestionIds(config) {
  const { count = 16, moduleFilter = 'all' } = config || {};
  let pool = QUESTIONS;
  if (moduleFilter && moduleFilter !== 'all') {
    pool = QUESTIONS.filter((q) => q.id.startsWith(moduleFilter));
  }
  const easy = shuffleArray(pool.filter((q) => q.difficulty === 'easy'));
  const medium = shuffleArray(pool.filter((q) => q.difficulty === 'medium'));
  const hard = shuffleArray(pool.filter((q) => q.difficulty === 'hard'));
  const million = shuffleArray(pool.filter((q) => q.difficulty === 'million'));

  const ordered = [...easy, ...medium, ...hard, ...million];
  const targetCount = Math.min(Number(count) || 16, ordered.length);
  if (targetCount === ordered.length) return ordered.map((q) => q.id);

  const tail = million.length > 0 ? million[0] : ordered[ordered.length - 1];
  const withoutTail = ordered.filter((q) => q.id !== tail.id);
  const picked = [];
  const step = withoutTail.length / Math.max(1, targetCount - 1);
  for (let i = 0; i < targetCount - 1; i++) {
    picked.push(withoutTail[Math.floor(i * step)]);
  }
  picked.push(tail);
  return picked.map((q) => q.id);
}

function getTierInfo(index, total) {
  if (total <= 1) return { label: '1 MILHÃO!', isMilestone: true, isFinal: true, multiplier: 2 };
  const mappedIdx = Math.min(
    MILHAO_LABELS.length - 1,
    Math.round((index / (total - 1)) * (MILHAO_LABELS.length - 1))
  );
  const label = MILHAO_LABELS[mappedIdx];
  const isFinal = index === total - 1;
  const isMilestone = isFinal || mappedIdx === 4 || mappedIdx === 9 || mappedIdx === 14;
  const multiplier = isFinal ? 2 : isMilestone ? 1.5 : 1;
  return { label, isMilestone, isFinal, multiplier };
}

function computeRemainingMs(meta) {
  const totalMs = (meta.config.timePerQuestion || 30) * 1000;
  if (!meta.questionStartedAt) return totalMs;
  const refNow = meta.paused && meta.pausedAt ? meta.pausedAt : Date.now();
  const elapsed = refNow - meta.questionStartedAt - (meta.accumulatedPauseMs || 0);
  return Math.max(0, totalMs - elapsed);
}

function buildRanking(playersObj, meta) {
  const scores = meta.scores || {};
  const prevRanks = meta.prevRanks || {};
  const list = Object.values(playersObj).map((p) => {
    const st = scores[p.playerId] || {
      score: 0,
      streak: 0,
      bestStreak: 0,
      correctCount: 0,
      answeredCount: 0
    };
    return {
      playerId: p.playerId,
      name: p.name,
      avatar: p.avatar,
      score: st.score || 0,
      streak: st.streak || 0,
      bestStreak: st.bestStreak || 0,
      correctCount: st.correctCount || 0,
      answeredCount: st.answeredCount || 0,
      prevRank: prevRanks[p.playerId] || null,
      connected: true
    };
  });

  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    return a.name.localeCompare(b.name);
  });

  return list.map((item, idx) => ({
    ...item,
    rank: idx + 1,
    rankDelta: item.prevRank ? item.prevRank - (idx + 1) : 0
  }));
}

function defaultLifelines() {
  return {
    cards: true,
    hint: true,
    skip: true,
    double: true,
    roundState: null
  };
}

function publicLifelines(lf, roundId) {
  const sameRound = lf && lf.roundState && lf.roundState.roundId === roundId;
  return {
    cards: lf ? !!lf.cards : true,
    hint: lf ? !!lf.hint : true,
    skip: lf ? !!lf.skip : true,
    double: lf ? !!lf.double : true,
    eliminated: sameRound ? lf.roundState.eliminated || [] : [],
    hintText: sameRound ? lf.roundState.hintText || null : null,
    usedDouble: sameRound ? !!lf.roundState.usedDouble : false
  };
}

async function performRevealIfNeeded(pin, force = false) {
  const meta = await store.getJson(keyMeta(pin));
  if (!meta || meta.phase !== 'question') return meta;

  const roundId = meta.roundId;
  const remainingMs = computeRemainingMs(meta);
  const [playersObj, answersObj] = await Promise.all([
    store.hgetallJson(keyPlayers(pin)),
    store.hgetallJson(keyAnswers(pin, roundId))
  ]);

  const playerCount = Object.keys(playersObj).length;
  const answerCount = Object.keys(answersObj).length;
  const allAnswered = playerCount > 0 && answerCount >= playerCount;

  if (!force && remainingMs > 0 && !allAnswered) {
    return meta;
  }

  // Lock idempotente para impedir cálculo duplicado em múltiplas invocações serverless
  const gotLock = await store.setJsonNx(keyRevealLock(pin, roundId), { at: Date.now() }, 120);
  if (!gotLock) {
    // Outra requisição já está revelando; lê meta atualizado
    return (await store.getJson(keyMeta(pin))) || meta;
  }

  const latestMeta = await store.getJson(keyMeta(pin));
  if (!latestMeta || latestMeta.phase !== 'question' || latestMeta.revealedRoundId === roundId) {
    return latestMeta || meta;
  }

  const qId = latestMeta.questionIds[latestMeta.currentIndex];
  const q = QUESTION_MAP.get(qId);
  const tier = getTierInfo(latestMeta.currentIndex, latestMeta.questionIds.length);
  const totalMs = (latestMeta.config.timePerQuestion || 30) * 1000;

  const distribution = [0, 0, 0, 0, 0];
  const roundResults = {};
  const scores = latestMeta.scores || {};

  for (const p of Object.values(playersObj)) {
    const st = scores[p.playerId] || {
      score: 0,
      streak: 0,
      bestStreak: 0,
      correctCount: 0,
      answeredCount: 0
    };
    const ans = answersObj[p.playerId];
    let status = 'timeout';
    let pointsEarned = 0;

    if (ans) {
      st.answeredCount++;
      if (ans.skipped) {
        status = 'skipped';
        pointsEarned = 250;
        st.score += pointsEarned;
      } else {
        if (typeof ans.choice === 'number' && ans.choice >= 0 && ans.choice < 5) {
          distribution[ans.choice]++;
        }
        if (ans.choice === q.correct) {
          status = 'correct';
          st.correctCount++;
          st.streak++;
          if (st.streak > st.bestStreak) st.bestStreak = st.streak;
          const ratio = Math.max(0, Math.min(1, (ans.remainingMs || 0) / Math.max(1, totalMs)));
          const base = Math.round(1000 * tier.multiplier);
          const speedBonus = Math.round(500 * ratio);
          const streakBonus = Math.min(st.streak - 1, 5) * 150;
          pointsEarned = base + speedBonus + streakBonus;
          if (ans.usedDouble) pointsEarned *= 2;
          st.score += pointsEarned;
        } else {
          status = 'wrong';
          st.streak = 0;
        }
      }
    } else {
      st.streak = 0;
    }

    scores[p.playerId] = st;
    roundResults[p.playerId] = {
      status,
      choice: ans ? ans.choice : null,
      pointsEarned
    };
  }

  latestMeta.scores = scores;
  latestMeta.phase = 'reveal';
  latestMeta.revealedRoundId = roundId;
  latestMeta.lastDistribution = distribution;
  latestMeta.lastRoundResults = roundResults;
  latestMeta.lastAnsweredCount = answerCount;

  await store.setJson(keyMeta(pin), latestMeta);
  return latestMeta;
}

async function createOrResumeHost(body) {
  const reqPin = body && body.pin ? String(body.pin).trim() : null;
  const reqToken = body && body.hostToken ? String(body.hostToken).trim() : null;

  if (reqPin && reqToken) {
    const existing = await store.getJson(keyMeta(reqPin));
    if (existing && existing.hostToken === reqToken) {
      return {
        pin: existing.pin,
        hostToken: existing.hostToken,
        phase: existing.phase,
        config: existing.config
      };
    }
  }

  const hostToken = crypto.randomUUID();
  let pin = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = String(Math.floor(1000 + Math.random() * 9000));
    const meta = {
      pin: candidate,
      hostToken,
      epoch: 1,
      phase: 'lobby',
      paused: false,
      pausedAt: null,
      accumulatedPauseMs: 0,
      config: { count: 16, timePerQuestion: 30, moduleFilter: 'all' },
      questionIds: [],
      currentIndex: 0,
      roundId: '1-0',
      questionStartedAt: null,
      scores: {},
      prevRanks: {},
      revealedRoundId: null,
      lastDistribution: [0, 0, 0, 0, 0],
      lastRoundResults: {},
      lastAnsweredCount: 0,
      createdAt: Date.now()
    };
    const ok = await store.setJsonNx(keyMeta(candidate), meta);
    if (ok) {
      pin = candidate;
      break;
    }
  }

  if (!pin) throw new Error('Não foi possível alocar PIN para a sala.');
  return {
    pin,
    hostToken,
    phase: 'lobby',
    config: { count: 16, timePerQuestion: 30, moduleFilter: 'all' }
  };
}

async function startMatch(body) {
  const pin = String(body.pin || '').trim();
  const meta = await store.getJson(keyMeta(pin));
  if (!meta || meta.hostToken !== body.hostToken) {
    throw new Error('Sala não encontrada ou token de host inválido.');
  }

  const cfg = body.config || {};
  meta.config = {
    count: Math.max(5, Math.min(32, Number(cfg.count) || 16)),
    timePerQuestion: Math.max(10, Math.min(90, Number(cfg.timePerQuestion) || 30)),
    moduleFilter: cfg.moduleFilter || 'all'
  };
  meta.epoch = (meta.epoch || 1) + 1;
  meta.questionIds = selectQuestionIds(meta.config);
  meta.currentIndex = 0;
  meta.roundId = `${meta.epoch}-0`;
  meta.phase = 'question';
  meta.paused = false;
  meta.pausedAt = null;
  meta.accumulatedPauseMs = 0;
  meta.questionStartedAt = Date.now();
  meta.scores = {};
  meta.prevRanks = {};
  meta.revealedRoundId = null;
  meta.lastDistribution = [0, 0, 0, 0, 0];
  meta.lastRoundResults = {};
  meta.lastAnsweredCount = 0;

  const playersObj = await store.hgetallJson(keyPlayers(pin));
  await Promise.all([
    store.setJson(keyMeta(pin), meta),
    ...Object.keys(playersObj).map((pid) => store.hsetJson(keyLifelines(pin), pid, defaultLifelines()))
  ]);

  return { ok: true, roundId: meta.roundId };
}

async function nextRound(body) {
  const pin = String(body.pin || '').trim();
  const meta = await store.getJson(keyMeta(pin));
  if (!meta || meta.hostToken !== body.hostToken) {
    throw new Error('Sala não encontrada ou token inválido.');
  }
  if (meta.phase !== 'reveal') return { ok: true, phase: meta.phase };

  const playersObj = await store.hgetallJson(keyPlayers(pin));
  const ranking = buildRanking(playersObj, meta);
  const prevRanks = {};
  ranking.forEach((r) => {
    prevRanks[r.playerId] = r.rank;
  });
  meta.prevRanks = prevRanks;
  meta.currentIndex += 1;

  if (meta.currentIndex >= meta.questionIds.length) {
    meta.phase = 'finished';
  } else {
    meta.phase = 'question';
    meta.roundId = `${meta.epoch}-${meta.currentIndex}`;
    meta.paused = false;
    meta.pausedAt = null;
    meta.accumulatedPauseMs = 0;
    meta.questionStartedAt = Date.now();
    meta.revealedRoundId = null;
  }

  await store.setJson(keyMeta(pin), meta);
  return { ok: true, phase: meta.phase, roundId: meta.roundId };
}

async function togglePause(body) {
  const pin = String(body.pin || '').trim();
  const meta = await store.getJson(keyMeta(pin));
  if (!meta || meta.hostToken !== body.hostToken || meta.phase !== 'question') {
    throw new Error('Operação indisponível.');
  }
  if (!meta.paused) {
    meta.paused = true;
    meta.pausedAt = Date.now();
  } else {
    const pausedDur = meta.pausedAt ? Date.now() - meta.pausedAt : 0;
    meta.accumulatedPauseMs = (meta.accumulatedPauseMs || 0) + pausedDur;
    meta.paused = false;
    meta.pausedAt = null;
  }
  await store.setJson(keyMeta(pin), meta);
  return { ok: true, paused: meta.paused, remainingMs: computeRemainingMs(meta) };
}

async function restartLobby(body) {
  const pin = String(body.pin || '').trim();
  const meta = await store.getJson(keyMeta(pin));
  if (!meta || meta.hostToken !== body.hostToken) {
    throw new Error('Sala não encontrada.');
  }
  meta.epoch = (meta.epoch || 1) + 1;
  meta.phase = 'lobby';
  meta.paused = false;
  meta.pausedAt = null;
  meta.accumulatedPauseMs = 0;
  meta.questionIds = [];
  meta.currentIndex = 0;
  meta.roundId = `${meta.epoch}-0`;
  meta.scores = {};
  meta.prevRanks = {};
  meta.revealedRoundId = null;
  meta.lastRoundResults = {};

  const playersObj = await store.hgetallJson(keyPlayers(pin));
  await Promise.all([
    store.setJson(keyMeta(pin), meta),
    ...Object.keys(playersObj).map((pid) => store.hsetJson(keyLifelines(pin), pid, defaultLifelines()))
  ]);
  return { ok: true, phase: 'lobby' };
}

async function joinPlayer(body) {
  const pin = String(body.pin || '').trim();
  const meta = await store.getJson(keyMeta(pin));
  if (!meta) {
    return { error: 'PIN da sala não encontrado. Confira na TV da sala!' };
  }
  const cleanName = String(body.name || '').trim().slice(0, 20);
  if (!cleanName) {
    return { error: 'Digite seu nome ou apelido para jogar!' };
  }
  const avatar = String(body.avatar || 'penguin');
  const playersObj = await store.hgetallJson(keyPlayers(pin));

  let playerId = body.playerId ? String(body.playerId) : null;
  if (!playerId || !playersObj[playerId]) {
    const byName = Object.values(playersObj).find(
      (p) => p.name.toLowerCase() === cleanName.toLowerCase()
    );
    playerId = byName ? byName.playerId : crypto.randomUUID();
  }

  const playerRecord = {
    playerId,
    name: cleanName,
    avatar,
    joinedAt: playersObj[playerId]?.joinedAt || Date.now()
  };

  await store.hsetJson(keyPlayers(pin), playerId, playerRecord);
  let lf = await store.hgetJson(keyLifelines(pin), playerId);
  if (!lf) {
    lf = defaultLifelines();
    await store.hsetJson(keyLifelines(pin), playerId, lf);
  }

  const totalPlayers = Object.keys(playersObj).length + (playersObj[playerId] ? 0 : 1);
  const st = (meta.scores && meta.scores[playerId]) || { score: 0, streak: 0 };

  return {
    pin,
    playerId,
    name: cleanName,
    avatar,
    phase: meta.phase,
    score: st.score || 0,
    streak: st.streak || 0,
    lifelines: publicLifelines(lf, meta.roundId),
    playerCount: totalPlayers
  };
}

async function submitAnswer(body) {
  const pin = String(body.pin || '').trim();
  const playerId = String(body.playerId || '').trim();
  const choice = Number(body.choice);
  if (!Number.isInteger(choice) || choice < 0 || choice > 4) {
    return { error: 'Alternativa inválida.' };
  }

  const meta = await store.getJson(keyMeta(pin));
  if (!meta || meta.phase !== 'question') {
    return { error: 'Rodada encerrada.' };
  }
  const remainingMs = computeRemainingMs(meta);
  if (remainingMs <= 0) {
    await performRevealIfNeeded(pin, true);
    return { error: 'Tempo esgotado!' };
  }

  const lf = (await store.hgetJson(keyLifelines(pin), playerId)) || defaultLifelines();
  const sameRound = lf.roundState && lf.roundState.roundId === meta.roundId;
  if (sameRound && Array.isArray(lf.roundState.eliminated) && lf.roundState.eliminated.includes(choice)) {
    return { error: 'Alternativa eliminada pelas Cartas.' };
  }

  const ansRecord = {
    choice,
    skipped: false,
    usedDouble: sameRound ? !!lf.roundState.usedDouble : false,
    remainingMs,
    answeredAt: Date.now()
  };

  await store.hsetnxJson(keyAnswers(pin, meta.roundId), playerId, ansRecord);
  await performRevealIfNeeded(pin, false);

  return { ok: true, choice };
}

async function useLifeline(body) {
  const pin = String(body.pin || '').trim();
  const playerId = String(body.playerId || '').trim();
  const kind = String(body.lifeline || '');

  const meta = await store.getJson(keyMeta(pin));
  if (!meta || meta.phase !== 'question') {
    return { error: 'Ajuda indisponível fora da rodada.' };
  }
  const existingAns = await store.hgetJson(keyAnswers(pin, meta.roundId), playerId);
  if (existingAns) return { error: 'Você já respondeu esta pergunta.' };

  const lf = (await store.hgetJson(keyLifelines(pin), playerId)) || defaultLifelines();
  if (!lf[kind]) return { error: 'Ajuda já utilizada.' };

  if (!lf.roundState || lf.roundState.roundId !== meta.roundId) {
    lf.roundState = { roundId: meta.roundId, eliminated: [], hintText: null, usedDouble: false };
  }

  const q = QUESTION_MAP.get(meta.questionIds[meta.currentIndex]);
  let result = { lifeline: kind };

  if (kind === 'cards') {
    lf.cards = false;
    const wrong = shuffleArray([0, 1, 2, 3, 4].filter((i) => i !== q.correct));
    const count = Math.random() < 0.45 ? 3 : 2;
    lf.roundState.eliminated = wrong.slice(0, count);
    result.eliminated = lf.roundState.eliminated;
    result.removedCount = count;
  } else if (kind === 'hint') {
    lf.hint = false;
    lf.roundState.hintText = q.hint;
    result.hint = q.hint;
  } else if (kind === 'double') {
    lf.double = false;
    lf.roundState.usedDouble = true;
  } else if (kind === 'skip') {
    lf.skip = false;
    await store.hsetnxJson(keyAnswers(pin, meta.roundId), playerId, {
      choice: null,
      skipped: true,
      usedDouble: false,
      remainingMs: 0,
      answeredAt: Date.now()
    });
    result.pointsEarned = 250;
    await performRevealIfNeeded(pin, false);
  } else {
    return { error: 'Ajuda desconhecida.' };
  }

  await store.hsetJson(keyLifelines(pin), playerId, lf);
  result.lifelines = publicLifelines(lf, meta.roundId);
  return result;
}

async function getHostState(pin, hostToken) {
  let meta = await store.getJson(keyMeta(pin));
  if (!meta) return { error: 'Sala expirada ou inexistente.' };
  if (hostToken && meta.hostToken !== hostToken) {
    return { error: 'Token de host inválido.' };
  }

  if (meta.phase === 'question') {
    meta = await performRevealIfNeeded(pin, false);
  }

  const playersObj = await store.hgetallJson(keyPlayers(pin));
  const players = Object.values(playersObj).map((p) => ({
    playerId: p.playerId,
    name: p.name,
    avatar: p.avatar,
    connected: true
  }));

  const state = {
    pin: meta.pin,
    phase: meta.phase,
    paused: !!meta.paused,
    config: meta.config,
    roundId: meta.roundId,
    index: meta.currentIndex,
    total: meta.questionIds.length,
    players,
    playerCount: players.length
  };

  if (meta.phase === 'question') {
    const q = QUESTION_MAP.get(meta.questionIds[meta.currentIndex]);
    const answersObj = await store.hgetallJson(keyAnswers(pin, meta.roundId));
    state.remainingSec = Math.ceil(computeRemainingMs(meta) / 1000);
    state.totalTimeSec = meta.config.timePerQuestion;
    state.answeredCount = Object.keys(answersObj).length;
    state.tier = getTierInfo(meta.currentIndex, meta.questionIds.length);
    state.question = {
      id: q.id,
      module: q.module,
      difficulty: q.difficulty,
      question: q.question,
      options: q.options
    };
  } else if (meta.phase === 'reveal') {
    const q = QUESTION_MAP.get(meta.questionIds[meta.currentIndex]);
    const ranking = buildRanking(playersObj, meta);
    state.tier = getTierInfo(meta.currentIndex, meta.questionIds.length);
    state.question = {
      id: q.id,
      module: q.module,
      difficulty: q.difficulty,
      question: q.question,
      options: q.options
    };
    state.correctIndex = q.correct;
    state.distribution = meta.lastDistribution || [0, 0, 0, 0, 0];
    state.explanation = q.explanation;
    state.hint = q.hint;
    state.answeredCount = meta.lastAnsweredCount || 0;
    state.ranking = ranking.slice(0, 12);
  } else if (meta.phase === 'finished') {
    state.ranking = buildRanking(playersObj, meta);
  }

  return state;
}

async function getPlayerState(pin, playerId) {
  let meta = await store.getJson(keyMeta(pin));
  if (!meta) return { error: 'Sala encerrada ou não encontrada.' };

  if (meta.phase === 'question') {
    meta = await performRevealIfNeeded(pin, false);
  }

  const [playersObj, lf] = await Promise.all([
    store.hgetallJson(keyPlayers(pin)),
    store.hgetJson(keyLifelines(pin), playerId)
  ]);

  if (!playersObj[playerId]) {
    return { error: 'Jogador não registrado nesta sala.' };
  }

  const scores = meta.scores || {};
  const st = scores[playerId] || { score: 0, streak: 0, bestStreak: 0, correctCount: 0 };
  const totalPlayers = Object.keys(playersObj).length;

  const state = {
    pin: meta.pin,
    phase: meta.phase,
    paused: !!meta.paused,
    roundId: meta.roundId,
    index: meta.currentIndex,
    total: meta.questionIds.length,
    playerCount: totalPlayers,
    score: st.score || 0,
    streak: st.streak || 0,
    lifelines: publicLifelines(lf, meta.roundId)
  };

  if (meta.phase === 'question') {
    const q = QUESTION_MAP.get(meta.questionIds[meta.currentIndex]);
    const ans = await store.hgetJson(keyAnswers(pin, meta.roundId), playerId);
    state.remainingSec = Math.ceil(computeRemainingMs(meta) / 1000);
    state.totalTimeSec = meta.config.timePerQuestion;
    state.tier = getTierInfo(meta.currentIndex, meta.questionIds.length);
    state.alreadyAnswered = !!ans;
    state.choice = ans ? ans.choice : null;
    state.question = {
      id: q.id,
      module: q.module,
      difficulty: q.difficulty,
      question: q.question,
      options: q.options
    };
  } else if (meta.phase === 'reveal') {
    const q = QUESTION_MAP.get(meta.questionIds[meta.currentIndex]);
    const ranking = buildRanking(playersObj, meta);
    const rankEntry = ranking.find((r) => r.playerId === playerId);
    const rr = (meta.lastRoundResults && meta.lastRoundResults[playerId]) || {
      status: 'timeout',
      choice: null,
      pointsEarned: 0
    };
    state.status = rr.status;
    state.choice = rr.choice;
    state.pointsEarned = rr.pointsEarned;
    state.correctIndex = q.correct;
    state.correctOptionText = q.options[q.correct];
    state.explanation = q.explanation;
    state.rank = rankEntry ? rankEntry.rank : null;
    state.rankDelta = rankEntry ? rankEntry.rankDelta : 0;
  } else if (meta.phase === 'finished') {
    const ranking = buildRanking(playersObj, meta);
    const rankEntry = ranking.find((r) => r.playerId === playerId);
    state.rank = rankEntry ? rankEntry.rank : null;
    state.correctCount = st.correctCount || 0;
    state.bestStreak = st.bestStreak || 0;
    state.top3 = ranking.slice(0, 3);
  }

  return state;
}

module.exports = {
  createOrResumeHost,
  startMatch,
  nextRound,
  togglePause,
  restartLobby,
  performRevealIfNeeded,
  joinPlayer,
  submitAnswer,
  useLifeline,
  getHostState,
  getPlayerState
};
