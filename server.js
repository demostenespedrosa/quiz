'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { QUESTIONS } = require('./public/js/questions.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const MILHAO_LABELS = [
  '1 MIL', '2 MIL', '3 MIL', '4 MIL', '5 MIL',
  '10 MIL', '20 MIL', '30 MIL', '40 MIL', '50 MIL',
  '100 MIL', '200 MIL', '300 MIL', '400 MIL', '500 MIL',
  '1 MILHÃO!'
];

// =========================================================
// Utilitários de Rede & WebSocket RFC 6455 (Zero Dependências)
// =========================================================
function getLocalIPv4List() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const lower = name.toLowerCase();
        const isVirtual =
          lower.includes('virtual') ||
          lower.includes('vmware') ||
          lower.includes('vbox') ||
          lower.includes('wsl') ||
          lower.includes('hyper-v') ||
          lower.includes('vethernet') ||
          lower.includes('loopback');
        candidates.push({
          name,
          ip: addr.address,
          priority: isVirtual ? 2 : addr.address.startsWith('192.168.') ? 0 : 1
        });
      }
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates;
}

function encodeWsFrame(opcode, payloadBuf) {
  const len = payloadBuf.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payloadBuf]);
}

function createWsClient(socket) {
  let buffer = Buffer.alloc(0);
  let closed = false;
  const client = {
    id: crypto.randomUUID(),
    alive: true,
    send(obj) {
      if (closed || socket.destroyed) return;
      try {
        const buf = Buffer.from(JSON.stringify(obj), 'utf8');
        socket.write(encodeWsFrame(0x1, buf));
      } catch (_) {}
    },
    ping() {
      if (closed || socket.destroyed) return;
      try {
        socket.write(encodeWsFrame(0x9, Buffer.alloc(0)));
      } catch (_) {}
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        socket.write(encodeWsFrame(0x8, Buffer.alloc(0)));
      } catch (_) {}
      socket.destroy();
    },
    onMessage: null,
    onClose: null
  };

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const first = buffer[0];
      const second = buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let payloadLen = second & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < 4) return;
        payloadLen = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buffer.length < 10) return;
        payloadLen = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLen = masked ? 4 : 0;
      if (buffer.length < offset + maskLen + payloadLen) return;

      let maskKey = null;
      if (masked) {
        maskKey = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      const payload = Buffer.from(buffer.subarray(offset, offset + payloadLen));
      buffer = buffer.subarray(offset + payloadLen);

      if (masked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      if (opcode === 0x8) {
        closed = true;
        socket.end();
        if (client.onClose) client.onClose();
        return;
      }
      if (opcode === 0x9) {
        if (!socket.destroyed) socket.write(encodeWsFrame(0xA, payload));
        continue;
      }
      if (opcode === 0xA) {
        client.alive = true;
        continue;
      }
      if (opcode === 0x1 && client.onMessage) {
        try {
          const msg = JSON.parse(payload.toString('utf8'));
          client.onMessage(msg);
        } catch (_) {}
      }
    }
  });

  const handleEnd = () => {
    if (!closed) {
      closed = true;
      if (client.onClose) client.onClose();
    }
  };

  socket.on('close', handleEnd);
  socket.on('error', handleEnd);
  return client;
}

// =========================================================
// Motor de Sala & Campeonato (Kahoot + Show do Milhão)
// =========================================================
const rooms = new Map();

function generatePin() {
  let pin;
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(pin));
  return pin;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function selectQuestions(config) {
  const { count = 16, moduleFilter = 'all' } = config || {};
  let pool = QUESTIONS;
  if (moduleFilter && moduleFilter !== 'all') {
    pool = QUESTIONS.filter((q) => q.id.startsWith(moduleFilter));
  }

  const easy = shuffleArray(pool.filter((q) => q.difficulty === 'easy'));
  const medium = shuffleArray(pool.filter((q) => q.difficulty === 'medium'));
  const hard = shuffleArray(pool.filter((q) => q.difficulty === 'hard'));
  const million = shuffleArray(pool.filter((q) => q.difficulty === 'million'));

  // Ordenação progressiva estilo Show do Milhão (Fácil -> Média -> Difícil -> Pergunta do Milhão)
  const ordered = [...easy, ...medium, ...hard, ...million];
  const targetCount = Math.min(Number(count) || 16, ordered.length);

  if (targetCount === ordered.length) return ordered;

  // Seleciona mantendo última pergunta como nível difícil/milhão
  const tail = million.length > 0 ? million[0] : ordered[ordered.length - 1];
  const withoutTail = ordered.filter((q) => q.id !== tail.id);
  const picked = [];
  const step = withoutTail.length / Math.max(1, targetCount - 1);
  for (let i = 0; i < targetCount - 1; i++) {
    picked.push(withoutTail[Math.floor(i * step)]);
  }
  picked.push(tail);
  return picked;
}

function getTierInfo(index, total) {
  if (total <= 1) return { label: '1 MILHÃO!', isMilestone: true, multiplier: 2 };
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

function getRanking(room) {
  const list = Array.from(room.players.values()).map((p) => ({
    playerId: p.playerId,
    name: p.name,
    avatar: p.avatar,
    score: p.score,
    prevRank: p.prevRank,
    streak: p.streak,
    bestStreak: p.bestStreak,
    correctCount: p.correctCount,
    answeredCount: p.answeredCount,
    connected: p.ws !== null
  }));
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

function broadcastPlayersLobby(room) {
  const players = Array.from(room.players.values()).map((p) => ({
    playerId: p.playerId,
    name: p.name,
    avatar: p.avatar,
    score: p.score,
    connected: p.ws !== null
  }));
  if (room.hostWs) {
    room.hostWs.send({
      type: 'room:players',
      players,
      count: players.length
    });
  }
  for (const p of room.players.values()) {
    if (p.ws) {
      p.ws.send({
        type: 'lobby:update',
        playerCount: players.length
      });
    }
  }
}

function clearRoomTimer(room) {
  if (room.timerHandle) {
    clearInterval(room.timerHandle);
    room.timerHandle = null;
  }
}

function startQuestion(room) {
  clearRoomTimer(room);
  const q = room.questions[room.currentIndex];
  if (!q) {
    finishGame(room);
    return;
  }

  // Salvar rank anterior para mostrar subida/descida no ranking
  const currentRanking = getRanking(room);
  currentRanking.forEach((entry) => {
    const p = room.players.get(entry.playerId);
    if (p) p.prevRank = entry.rank;
  });

  room.phase = 'question';
  room.paused = false;
  room.questionStartedAt = Date.now();
  room.remainingMs = room.config.timePerQuestion * 1000;
  room.answers.clear();

  for (const p of room.players.values()) {
    p.currentBoost = false;
    p.currentHintUsed = false;
    p.currentEliminated = [];
  }

  const tier = getTierInfo(room.currentIndex, room.questions.length);

  if (room.hostWs) {
    room.hostWs.send({
      type: 'game:question',
      index: room.currentIndex,
      total: room.questions.length,
      timeSec: room.config.timePerQuestion,
      tier,
      question: {
        id: q.id,
        module: q.module,
        difficulty: q.difficulty,
        question: q.question,
        options: q.options
      },
      totalPlayers: room.players.size
    });
  }

  for (const p of room.players.values()) {
    if (p.ws) {
      p.ws.send({
        type: 'game:question',
        index: room.currentIndex,
        total: room.questions.length,
        timeSec: room.config.timePerQuestion,
        tier,
        question: {
          id: q.id,
          module: q.module,
          difficulty: q.difficulty,
          question: q.question,
          options: q.options
        },
        lifelines: p.lifelines,
        score: p.score,
        streak: p.streak
      });
    }
  }

  let lastTick = Date.now();
  room.timerHandle = setInterval(() => {
    if (room.phase !== 'question') return;
    if (room.paused) {
      lastTick = Date.now();
      return;
    }
    const now = Date.now();
    room.remainingMs -= now - lastTick;
    lastTick = now;

    if (room.remainingMs <= 0) {
      room.remainingMs = 0;
      revealAnswer(room);
    }
  }, 150);
}

function revealAnswer(room) {
  if (room.phase !== 'question') return;
  clearRoomTimer(room);
  room.phase = 'reveal';

  const q = room.questions[room.currentIndex];
  const tier = getTierInfo(room.currentIndex, room.questions.length);
  const distribution = [0, 0, 0, 0, 0];

  for (const ans of room.answers.values()) {
    if (typeof ans.choice === 'number' && ans.choice >= 0 && ans.choice < 5) {
      distribution[ans.choice]++;
    }
  }

  const ranking = getRanking(room);
  const rankMap = new Map(ranking.map((r) => [r.playerId, r]));

  if (room.hostWs) {
    room.hostWs.send({
      type: 'game:reveal',
      index: room.currentIndex,
      total: room.questions.length,
      correctIndex: q.correct,
      distribution,
      explanation: q.explanation,
      hint: q.hint,
      tier,
      ranking: ranking.slice(0, 12),
      totalPlayers: room.players.size,
      answeredCount: room.answers.size
    });
  }

  for (const p of room.players.values()) {
    if (!p.ws) continue;
    const ans = room.answers.get(p.playerId);
    const rankEntry = rankMap.get(p.playerId);
    let status = 'timeout';
    if (ans) {
      if (ans.skipped) status = 'skipped';
      else if (ans.isCorrect) status = 'correct';
      else status = 'wrong';
    } else {
      p.streak = 0;
    }

    p.ws.send({
      type: 'game:reveal',
      status,
      correctIndex: q.correct,
      correctOptionText: q.options[q.correct],
      choice: ans ? ans.choice : null,
      pointsEarned: ans ? ans.pointsEarned : 0,
      newScore: p.score,
      streak: p.streak,
      rank: rankEntry ? rankEntry.rank : null,
      rankDelta: rankEntry ? rankEntry.rankDelta : 0,
      totalPlayers: room.players.size,
      explanation: q.explanation,
      lifelines: p.lifelines
    });
  }
}

function finishGame(room) {
  clearRoomTimer(room);
  room.phase = 'finished';
  const ranking = getRanking(room);
  const rankMap = new Map(ranking.map((r) => [r.playerId, r]));

  if (room.hostWs) {
    room.hostWs.send({
      type: 'game:finished',
      ranking,
      totalQuestions: room.questions.length
    });
  }

  for (const p of room.players.values()) {
    if (!p.ws) continue;
    const entry = rankMap.get(p.playerId);
    p.ws.send({
      type: 'game:finished',
      rank: entry ? entry.rank : null,
      score: p.score,
      correctCount: p.correctCount,
      bestStreak: p.bestStreak,
      totalQuestions: room.questions.length,
      totalPlayers: room.players.size,
      top3: ranking.slice(0, 3)
    });
  }
}

function handlePlayerAnswer(room, player, choice) {
  if (room.phase !== 'question') return;
  if (room.answers.has(player.playerId)) return;
  if (typeof choice !== 'number' || choice < 0 || choice > 4) return;
  if (player.currentEliminated.includes(choice)) return;

  const q = room.questions[room.currentIndex];
  const tier = getTierInfo(room.currentIndex, room.questions.length);
  const totalMs = room.config.timePerQuestion * 1000;
  const ratio = Math.max(0, Math.min(1, room.remainingMs / totalMs));
  const isCorrect = choice === q.correct;

  let pointsEarned = 0;
  player.answeredCount++;

  if (isCorrect) {
    player.correctCount++;
    player.streak++;
    if (player.streak > player.bestStreak) player.bestStreak = player.streak;
    const base = Math.round(1000 * tier.multiplier);
    const speedBonus = Math.round(500 * ratio);
    const streakBonus = Math.min(player.streak - 1, 5) * 150;
    pointsEarned = base + speedBonus + streakBonus;
    if (player.currentBoost) pointsEarned *= 2;
    player.score += pointsEarned;
  } else {
    player.streak = 0;
  }

  room.answers.set(player.playerId, {
    choice,
    isCorrect,
    skipped: false,
    pointsEarned,
    atMs: totalMs - room.remainingMs
  });

  if (player.ws) {
    player.ws.send({
      type: 'answer:ack',
      choice,
      answeredCount: room.answers.size,
      totalPlayers: room.players.size
    });
  }

  if (room.hostWs) {
    room.hostWs.send({
      type: 'room:answer_progress',
      answeredCount: room.answers.size,
      totalPlayers: room.players.size,
      lastPlayer: { name: player.name, avatar: player.avatar }
    });
  }

  // Se todos os jogadores conectados já responderam, revela imediatamente!
  const connectedCount = Array.from(room.players.values()).filter((p) => p.ws !== null).length;
  if (connectedCount > 0 && room.answers.size >= connectedCount) {
    setTimeout(() => {
      if (room.phase === 'question') revealAnswer(room);
    }, 350);
  }
}

function handlePlayerLifeline(room, player, lifeline) {
  if (room.phase !== 'question') return;
  if (room.answers.has(player.playerId)) return;
  if (!player.lifelines[lifeline]) return;

  const q = room.questions[room.currentIndex];

  if (lifeline === 'cards') {
    player.lifelines.cards = false;
    const wrongIndices = [0, 1, 2, 3, 4].filter((idx) => idx !== q.correct);
    const shuffled = shuffleArray(wrongIndices);
    // Carta estilo Show do Milhão: elimina 2 ou 3 erradas!
    const removeCount = Math.random() < 0.45 ? 3 : 2;
    player.currentEliminated = shuffled.slice(0, removeCount);
    player.ws?.send({
      type: 'lifeline:result',
      lifeline: 'cards',
      eliminated: player.currentEliminated,
      removedCount: removeCount,
      lifelines: player.lifelines
    });
  } else if (lifeline === 'hint') {
    player.lifelines.hint = false;
    player.currentHintUsed = true;
    player.ws?.send({
      type: 'lifeline:result',
      lifeline: 'hint',
      hint: q.hint,
      lifelines: player.lifelines
    });
  } else if (lifeline === 'double') {
    player.lifelines.double = false;
    player.currentBoost = true;
    player.ws?.send({
      type: 'lifeline:result',
      lifeline: 'double',
      lifelines: player.lifelines
    });
  } else if (lifeline === 'skip') {
    player.lifelines.skip = false;
    player.answeredCount++;
    // Pula mantendo o combo e ganhando 250 pontos seguros
    const safePts = 250;
    player.score += safePts;
    room.answers.set(player.playerId, {
      choice: null,
      isCorrect: false,
      skipped: true,
      pointsEarned: safePts,
      atMs: 0
    });
    player.ws?.send({
      type: 'lifeline:result',
      lifeline: 'skip',
      pointsEarned: safePts,
      lifelines: player.lifelines
    });
    if (room.hostWs) {
      room.hostWs.send({
        type: 'room:answer_progress',
        answeredCount: room.answers.size,
        totalPlayers: room.players.size,
        lastPlayer: { name: player.name, avatar: player.avatar }
      });
    }
    const connectedCount = Array.from(room.players.values()).filter((p) => p.ws !== null).length;
    if (connectedCount > 0 && room.answers.size >= connectedCount) {
      setTimeout(() => {
        if (room.phase === 'question') revealAnswer(room);
      }, 350);
    }
  }
}

function handleMessage(ws, msg) {
  if (!msg || typeof msg.type !== 'string') return;

  // HOST: Criar ou reconectar sala
  if (msg.type === 'host:create') {
    const requestedPin = msg.pin && rooms.has(msg.pin) ? msg.pin : null;
    if (requestedPin) {
      const existing = rooms.get(requestedPin);
      existing.hostWs = ws;
      ws.role = 'host';
      ws.roomPin = requestedPin;
      ws.send({
        type: 'host:ready',
        pin: requestedPin,
        phase: existing.phase,
        config: existing.config,
        players: Array.from(existing.players.values()).map((p) => ({
          playerId: p.playerId,
          name: p.name,
          avatar: p.avatar,
          score: p.score,
          connected: p.ws !== null
        })),
        ips: getLocalIPv4List(),
        port: PORT
      });
      return;
    }

    const pin = generatePin();
    const room = {
      pin,
      hostWs: ws,
      phase: 'lobby', // 'lobby' | 'question' | 'reveal' | 'finished'
      paused: false,
      config: {
        count: 16,
        timePerQuestion: 30,
        moduleFilter: 'all'
      },
      questions: [],
      currentIndex: 0,
      players: new Map(),
      answers: new Map(),
      timerHandle: null,
      remainingMs: 0,
      questionStartedAt: 0
    };
    rooms.set(pin, room);
    ws.role = 'host';
    ws.roomPin = pin;
    ws.send({
      type: 'host:ready',
      pin,
      phase: room.phase,
      config: room.config,
      players: [],
      ips: getLocalIPv4List(),
      port: PORT
    });
    return;
  }

  // HOST: Iniciar campeonato
  if (msg.type === 'host:start') {
    const room = rooms.get(ws.roomPin);
    if (!room || room.hostWs !== ws) return;
    if (msg.config) {
      room.config = {
        count: Math.max(5, Math.min(32, Number(msg.config.count) || 16)),
        timePerQuestion: Math.max(10, Math.min(90, Number(msg.config.timePerQuestion) || 30)),
        moduleFilter: msg.config.moduleFilter || 'all'
      };
    }
    room.questions = selectQuestions(room.config);
    room.currentIndex = 0;
    for (const p of room.players.values()) {
      p.score = 0;
      p.streak = 0;
      p.bestStreak = 0;
      p.correctCount = 0;
      p.answeredCount = 0;
      p.prevRank = null;
      p.lifelines = { cards: true, hint: true, skip: true, double: true };
    }
    startQuestion(room);
    return;
  }

  if (msg.type === 'host:next') {
    const room = rooms.get(ws.roomPin);
    if (!room || room.hostWs !== ws) return;
    if (room.phase === 'reveal') {
      room.currentIndex++;
      if (room.currentIndex >= room.questions.length) {
        finishGame(room);
      } else {
        startQuestion(room);
      }
    }
    return;
  }

  if (msg.type === 'host:reveal') {
    const room = rooms.get(ws.roomPin);
    if (!room || room.hostWs !== ws) return;
    revealAnswer(room);
    return;
  }

  if (msg.type === 'host:pause') {
    const room = rooms.get(ws.roomPin);
    if (!room || room.hostWs !== ws || room.phase !== 'question') return;
    room.paused = !room.paused;
    room.hostWs.send({ type: 'game:paused', paused: room.paused, remainingMs: room.remainingMs });
    for (const p of room.players.values()) {
      p.ws?.send({ type: 'game:paused', paused: room.paused });
    }
    return;
  }

  if (msg.type === 'host:restart') {
    const room = rooms.get(ws.roomPin);
    if (!room || room.hostWs !== ws) return;
    clearRoomTimer(room);
    room.phase = 'lobby';
    room.currentIndex = 0;
    room.answers.clear();
    for (const p of room.players.values()) {
      p.score = 0;
      p.streak = 0;
      p.bestStreak = 0;
      p.correctCount = 0;
      p.answeredCount = 0;
      p.prevRank = null;
      p.lifelines = { cards: true, hint: true, skip: true, double: true };
      p.ws?.send({ type: 'game:lobby', playerCount: room.players.size });
    }
    broadcastPlayersLobby(room);
    room.hostWs.send({ type: 'host:back_to_lobby', phase: 'lobby' });
    return;
  }

  // ALUNO: Entrar ou reconectar na sala
  if (msg.type === 'player:join') {
    const pin = String(msg.pin || '').trim();
    const room = rooms.get(pin);
    if (!room) {
      ws.send({ type: 'player:error', message: 'PIN da sala não encontrado. Confira na TV da sala!' });
      return;
    }

    const cleanName = String(msg.name || '').trim().slice(0, 20);
    if (!cleanName) {
      ws.send({ type: 'player:error', message: 'Digite seu nome ou apelido para jogar!' });
      return;
    }

    const avatar = String(msg.avatar || 'penguin');
    let player = msg.playerId ? room.players.get(msg.playerId) : null;

    if (!player) {
      // Verifica se já existe alguém desconectado com mesmo nome para facilitar reconexão
      for (const existing of room.players.values()) {
        if (existing.name.toLowerCase() === cleanName.toLowerCase() && existing.ws === null) {
          player = existing;
          break;
        }
      }
    }

    if (!player) {
      const playerId = msg.playerId || crypto.randomUUID();
      player = {
        playerId,
        name: cleanName,
        avatar,
        score: 0,
        streak: 0,
        bestStreak: 0,
        correctCount: 0,
        answeredCount: 0,
        prevRank: null,
        lifelines: { cards: true, hint: true, skip: true, double: true },
        currentBoost: false,
        currentHintUsed: false,
        currentEliminated: [],
        ws
      };
      room.players.set(playerId, player);
    } else {
      player.name = cleanName;
      player.avatar = avatar;
      player.ws = ws;
    }

    ws.role = 'player';
    ws.roomPin = pin;
    ws.playerId = player.playerId;

    ws.send({
      type: 'player:joined',
      pin,
      playerId: player.playerId,
      name: player.name,
      avatar: player.avatar,
      phase: room.phase,
      score: player.score,
      streak: player.streak,
      lifelines: player.lifelines,
      playerCount: room.players.size
    });

    broadcastPlayersLobby(room);

    // Se entrou/reconectou no meio de uma pergunta ativa, envia a pergunta atual
    if (room.phase === 'question') {
      const q = room.questions[room.currentIndex];
      const tier = getTierInfo(room.currentIndex, room.questions.length);
      const alreadyAnswered = room.answers.has(player.playerId);
      ws.send({
        type: 'game:question',
        index: room.currentIndex,
        total: room.questions.length,
        timeSec: Math.ceil(room.remainingMs / 1000),
        totalTimeSec: room.config.timePerQuestion,
        tier,
        question: {
          id: q.id,
          module: q.module,
          difficulty: q.difficulty,
          question: q.question,
          options: q.options
        },
        lifelines: player.lifelines,
        score: player.score,
        streak: player.streak,
        alreadyAnswered,
        eliminated: player.currentEliminated
      });
    }
    return;
  }

  if (msg.type === 'player:answer') {
    const room = rooms.get(ws.roomPin);
    if (!room) return;
    const player = room.players.get(ws.playerId);
    if (!player) return;
    handlePlayerAnswer(room, player, msg.choice);
    return;
  }

  if (msg.type === 'player:lifeline') {
    const room = rooms.get(ws.roomPin);
    if (!room) return;
    const player = room.players.get(ws.playerId);
    if (!player) return;
    handlePlayerLifeline(room, player, msg.lifeline);
  }
}

// =========================================================
// Servidor HTTP + Upgrade WebSocket
// =========================================================
const apiGameHandler = require('./api/game');

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        mode: 'local',
        hasRedis: false,
        port: PORT,
        ips: getLocalIPv4List(),
        totalQuestions: QUESTIONS.length
      })
    );
    return;
  }

  if (urlPath === '/api/game') {
    apiGameHandler(req, res);
    return;
  }

  let relPath = urlPath;
  if (relPath === '/') relPath = '/index.html';
  else if (relPath === '/tv') relPath = '/tv.html';
  else if (relPath === '/play') relPath = '/play.html';

  const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo não encontrado');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

const allClients = new Set();

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash('sha1')
    .update(key + WS_GUID)
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n'
    ].join('\r\n')
  );

  const client = createWsClient(socket);
  allClients.add(client);

  client.onMessage = (msg) => handleMessage(client, msg);
  client.onClose = () => {
    allClients.delete(client);
    const room = rooms.get(client.roomPin);
    if (!room) return;
    if (room.hostWs === client) {
      room.hostWs = null;
    } else if (client.playerId && room.players.has(client.playerId)) {
      const p = room.players.get(client.playerId);
      if (p.ws === client) {
        p.ws = null;
        broadcastPlayersLobby(room);
      }
    }
  };
});

setInterval(() => {
  for (const c of allClients) {
    if (!c.alive) {
      c.close();
      allClients.delete(c);
    } else {
      c.alive = false;
      c.ping();
    }
  }
}, 20000);

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPv4List();
  console.log('\n==============================================================');
  console.log('  LINUX ARENA: DUO DO MILHAO — Servidor em Tempo Real Ativo!');
  console.log('==============================================================');
  console.log(`  Tela de Inicio / TV (este PC):  http://localhost:${PORT}/tv`);
  if (ips.length > 0) {
    console.log('  Link para os Alunos (Celular na mesma rede Wi-Fi):');
    ips.forEach((entry) => {
      console.log(`   -> http://${entry.ip}:${PORT}/play   (${entry.name})`);
    });
  }
  console.log('==============================================================\n');
});
