/**
 * Lógica da Tela do Celular / Aluno (play.html)
 * Suporta:
 *  1) Modo Campeonato Ao Vivo via WebSocket (Local) OU Serverless HTTP (Vercel)
 *  2) Modo Treino Solo (offline) com as 32 questões da apostila
 */
(function () {
  'use strict';

  const LETTERS = ['A', 'B', 'C', 'D', 'E'];
  const $ = (id) => document.getElementById(id);

  let mode = 'live'; // 'live' | 'solo'
  let transport = 'ws'; // 'ws' | 'http'
  let transportChecked = false;
  let ws = null;
  let pollHandle = null;
  let lastPhaseKey = null;

  let selectedAvatar = sessionStorage.getItem('linux_arena_avatar') || 'penguin';
  let playerId = sessionStorage.getItem('linux_arena_pid') || null;
  let playerName = sessionStorage.getItem('linux_arena_name') || '';
  let roomPin = new URLSearchParams(location.search).get('pin') || sessionStorage.getItem('linux_arena_pin') || '';

  let currentOptions = [];
  let chosenIndex = null;
  let eliminatedSet = new Set();
  let lifelines = { cards: true, hint: true, skip: true, double: true };
  let doubleActive = false;
  let timerHandle = null;
  let totalSec = 30;
  let remainingSec = 30;
  let paused = false;

  // Estado do Modo Solo
  let soloQuestions = [];
  let soloIndex = 0;
  let soloScore = 0;
  let soloStreak = 0;
  let soloBestStreak = 0;
  let soloCorrect = 0;

  function showScreen(name) {
    $('screen-join').hidden = name !== 'join';
    $('screen-lobby').hidden = name !== 'lobby';
    $('screen-question').hidden = name !== 'question';
    $('screen-feedback').hidden = name !== 'feedback';
    $('screen-finished').hidden = name !== 'finished';
  }

  function updateSoundBtn() {
    $('btn-mute').textContent = SoundFX.muted ? '🔇' : '🔊';
    $('btn-mute').setAttribute('aria-pressed', String(SoundFX.muted));
  }
  updateSoundBtn();
  $('btn-mute').addEventListener('click', () => {
    SoundFX.toggleMute();
    updateSoundBtn();
    SoundFX.tap();
  });

  $('join-mascot').innerHTML = MascotUI.renderMascot('idle', 68);
  $('header-avatar').innerHTML = MascotUI.renderAvatar(selectedAvatar, 38);

  const picker = $('avatar-picker');
  picker.innerHTML = MascotUI.AVATARS.map(
    (av) => `
    <button type="button" class="avatar-choice ${av.id === selectedAvatar ? 'is-selected' : ''}" data-avatar="${av.id}" role="radio" aria-checked="${av.id === selectedAvatar}">
      ${MascotUI.renderAvatar(av.id, 38)}
      <span>${av.label}</span>
    </button>
  `
  ).join('');

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.avatar-choice');
    if (!btn) return;
    SoundFX.tap();
    selectedAvatar = btn.dataset.avatar;
    sessionStorage.setItem('linux_arena_avatar', selectedAvatar);
    $('header-avatar').innerHTML = MascotUI.renderAvatar(selectedAvatar, 38);
    picker.querySelectorAll('.avatar-choice').forEach((el) => {
      const sel = el === btn;
      el.classList.toggle('is-selected', sel);
      el.setAttribute('aria-checked', String(sel));
    });
  });

  if (roomPin) $('input-pin').value = roomPin;
  if (playerName) $('input-name').value = playerName;

  function stopTimer() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  function startTimer(sec, fullSec) {
    stopTimer();
    totalSec = fullSec || sec;
    remainingSec = sec;
    renderTimer();
    timerHandle = setInterval(() => {
      if (paused) return;
      remainingSec = Math.max(0, remainingSec - 0.2);
      renderTimer();
      if (remainingSec <= 0) {
        stopTimer();
        if (mode === 'solo' && chosenIndex === null) {
          finishSoloQuestion(null, false);
        }
      }
    }, 200);
  }

  function renderTimer() {
    const secs = Math.ceil(remainingSec);
    const pill = $('play-timer-pill');
    pill.textContent = `⏱️ ${secs}s`;
    pill.className = `duo-pill ${secs <= 5 ? 'duo-pill--red' : secs <= 12 ? 'duo-pill--orange' : 'duo-pill--green'}`;
    const pct = Math.max(0, Math.min(100, (remainingSec / Math.max(1, totalSec)) * 100));
    const fill = $('play-progress-fill');
    fill.style.inlineSize = `${pct}%`;
    fill.classList.toggle('is-warning', pct <= 45 && pct > 20);
    fill.classList.toggle('is-danger', pct <= 20);
  }

  function updateHeaderStats(score, streak) {
    $('header-score').hidden = false;
    $('header-streak').hidden = false;
    $('score-val').textContent = (score || 0).toLocaleString('pt-BR');
    $('streak-val').textContent = String(streak || 0);
  }

  function renderLifelines() {
    $('life-cards').disabled = !lifelines.cards || chosenIndex !== null;
    $('life-hint').disabled = !lifelines.hint || chosenIndex !== null;
    $('life-double').disabled = !lifelines.double || chosenIndex !== null;
    $('life-skip').disabled = !lifelines.skip || chosenIndex !== null;
    $('life-double').classList.toggle('is-active', doubleActive);
  }

  function renderMobileOptions(locked = false) {
    const wrap = $('play-options');
    wrap.innerHTML = currentOptions
      .map((text, idx) => {
        const isElim = eliminatedSet.has(idx);
        const isChosen = chosenIndex === idx;
        return `
          <button
            type="button"
            class="mobile-opt-btn mobile-opt-btn--${idx} ${isElim ? 'is-eliminated' : ''} ${isChosen ? 'is-chosen' : ''}"
            data-choice="${idx}"
            ${locked || isElim || chosenIndex !== null ? 'disabled' : ''}
          >
            <span class="mobile-opt-letter">${LETTERS[idx]}</span>
            <span>${escapeHtml(text)}</span>
          </button>
        `;
      })
      .join('');
  }

  function launchConfetti() {
    const layer = $('confetti-layer');
    layer.innerHTML = '';
    const colors = ['#58cc02', '#1cb0f6', '#ffc800', '#ff9600', '#a855f7'];
    for (let i = 0; i < 36; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.insetInlineStart = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 0.6}s`;
      layer.appendChild(piece);
    }
    setTimeout(() => {
      layer.innerHTML = '';
    }, 3000);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function applyQuestionScreen(msg) {
    chosenIndex = msg.alreadyAnswered ? (msg.choice ?? -1) : null;
    eliminatedSet = new Set(msg.eliminated || (msg.lifelines && msg.lifelines.eliminated) || []);
    doubleActive = !!(msg.lifelines && msg.lifelines.usedDouble);
    paused = !!msg.paused;
    lifelines = msg.lifelines || lifelines;
    currentOptions = msg.question.options;

    $('play-q-num').textContent = `${msg.index + 1} / ${msg.total}`;
    $('play-q-tier').textContent = msg.tier.isFinal ? '👑 1 MILHÃO!' : `🏆 ${msg.tier.label}`;
    $('play-q-module').textContent = msg.question.module;
    $('play-q-text').textContent = msg.question.question;

    const hintText = msg.lifelines && msg.lifelines.hintText;
    if (hintText) {
      $('play-hint-text').textContent = hintText;
      $('play-hint-box').hidden = false;
    } else {
      $('play-hint-box').hidden = true;
    }

    $('play-waiting-ack').hidden = !msg.alreadyAnswered;

    updateHeaderStats(msg.score || 0, msg.streak || 0);
    renderLifelines();
    renderMobileOptions(!!msg.alreadyAnswered);
    showScreen('question');
    startTimer(msg.remainingSec ?? msg.timeSec, msg.totalTimeSec || msg.timeSec);
  }

  function showFeedbackScreen(data) {
    const banner = $('feedback-banner');
    banner.className = 'duo-feedback-banner';

    if (data.status === 'correct') {
      banner.classList.add('duo-feedback-banner--correct');
      $('feedback-mascot').innerHTML = MascotUI.renderMascot('happy', 68);
      $('feedback-title').textContent = data.streak >= 3 ? `Combo x${data.streak}! 🔥` : 'Mandou muito bem!';
      $('feedback-points').textContent = `+${data.pointsEarned.toLocaleString('pt-BR')} pts`;
      $('feedback-correct-answer').textContent = `Resposta ${LETTERS[data.correctIndex]} confirmada!`;
      SoundFX.correct(data.streak);
    } else if (data.status === 'skipped') {
      banner.classList.add('duo-feedback-banner--skipped');
      $('feedback-mascot').innerHTML = MascotUI.renderMascot('thinking', 68);
      $('feedback-title').textContent = 'Pulou com segurança!';
      $('feedback-points').textContent = `+${data.pointsEarned} pts • Sequência mantida`;
      $('feedback-correct-answer').textContent = `A certa era ${LETTERS[data.correctIndex]}: ${data.correctOptionText}`;
      SoundFX.lifeline();
    } else {
      banner.classList.add('duo-feedback-banner--wrong');
      $('feedback-mascot').innerHTML = MascotUI.renderMascot('oops', 68);
      $('feedback-title').textContent = data.status === 'timeout' ? 'Tempo esgotado!' : 'Quase lá!';
      $('feedback-points').textContent = '+0 pts nesta rodada';
      $('feedback-correct-answer').textContent = `Resposta certa (${LETTERS[data.correctIndex]}): ${data.correctOptionText}`;
      SoundFX.wrong();
    }

    $('feedback-explanation').textContent = data.explanation;
    if (mode === 'live') {
      $('feedback-rank-card').hidden = false;
      $('feedback-rank').textContent = `#${data.rank || '-'} de ${data.totalPlayers || '-'}`;
      $('feedback-total-score').textContent = `${(data.newScore || 0).toLocaleString('pt-BR')} pts`;
      $('btn-solo-next').hidden = true;
    } else {
      $('feedback-rank-card').hidden = true;
      $('btn-solo-next').hidden = false;
      $('btn-solo-next').textContent =
        soloIndex + 1 >= soloQuestions.length ? '🏆 Ver Resultado Final' : '➡️ Próxima Pergunta';
    }

    showScreen('feedback');
  }

  function applyFinishedScreen(msg) {
    stopTimer();
    $('finish-mascot').innerHTML = MascotUI.renderMascot(msg.rank <= 3 ? 'crown' : 'happy', 105);
    $('finish-title').textContent =
      msg.rank === 1
        ? '🏆 CAMPEÃO DA TURMA!'
        : msg.rank <= 3
        ? `🎉 Você ficou em ${msg.rank}º lugar!`
        : `Você terminou em ${msg.rank}º de ${msg.totalPlayers}!`;
    $('finish-stats').textContent = `Acertos: ${msg.correctCount} de ${msg.totalQuestions} perguntas`;
    $('finish-score-pill').textContent = `${(msg.score || 0).toLocaleString('pt-BR')} pts`;
    $('finish-streak-pill').textContent = `🔥 Melhor combo: ${msg.bestStreak || 0}`;
    $('btn-finish-home').hidden = true;
    showScreen('finished');
    SoundFX.podium();
    if (msg.rank <= 3) launchConfetti();
  }

  // =========================================================
  // TRANSPORTE 1: WebSocket (Local LAN)
  // =========================================================
  function connectWS(pin, name) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (ws) {
      try { ws.close(); } catch (_) {}
    }
    ws = new WebSocket(`${proto}//${location.host}`);

    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          type: 'player:join',
          pin,
          name,
          avatar: selectedAvatar,
          playerId
        })
      );
    });

    ws.addEventListener('close', () => {
      if (mode === 'live' && transport === 'ws' && $('screen-join').hidden) {
        setTimeout(() => {
          if (mode === 'live' && roomPin && playerName) connectWS(roomPin, playerName);
        }, 1800);
      }
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (_) {
        return;
      }

      if (msg.type === 'player:error') {
        $('join-error').textContent = msg.message;
        $('join-error').hidden = false;
        SoundFX.wrong();
        return;
      }

      if (msg.type === 'player:joined') {
        playerId = msg.playerId;
        roomPin = msg.pin;
        playerName = msg.name;
        sessionStorage.setItem('linux_arena_pid', playerId);
        sessionStorage.setItem('linux_arena_pin', roomPin);
        sessionStorage.setItem('linux_arena_name', playerName);

        $('header-player-name').textContent = playerName;
        $('header-sub').textContent = `Sala ${roomPin}`;
        lifelines = msg.lifelines || lifelines;
        updateHeaderStats(msg.score || 0, msg.streak || 0);
        $('lobby-count').textContent = String(msg.playerCount || 1);
        $('lobby-mascot').innerHTML = MascotUI.renderMascot('happy', 96);
        if (msg.phase === 'lobby') {
          showScreen('lobby');
          SoundFX.join();
        }
      } else if (msg.type === 'lobby:update') {
        $('lobby-count').textContent = String(msg.playerCount || 1);
      } else if (msg.type === 'game:lobby') {
        stopTimer();
        lifelines = { cards: true, hint: true, skip: true, double: true };
        updateHeaderStats(0, 0);
        showScreen('lobby');
      } else if (msg.type === 'game:question') {
        applyQuestionScreen(msg);
      } else if (msg.type === 'game:paused') {
        paused = msg.paused;
      } else if (msg.type === 'lifeline:result') {
        lifelines = msg.lifelines || lifelines;
        SoundFX.lifeline();
        if (msg.lifeline === 'cards') {
          (msg.eliminated || []).forEach((i) => eliminatedSet.add(i));
          renderMobileOptions(false);
        } else if (msg.lifeline === 'hint') {
          $('play-hint-text').textContent = msg.hint;
          $('play-hint-box').hidden = false;
        } else if (msg.lifeline === 'double') {
          doubleActive = true;
        } else if (msg.lifeline === 'skip') {
          chosenIndex = -1;
          renderMobileOptions(true);
          $('play-waiting-ack').hidden = false;
        }
        renderLifelines();
      } else if (msg.type === 'answer:ack') {
        chosenIndex = msg.choice;
        renderMobileOptions(true);
        renderLifelines();
        $('play-waiting-ack').hidden = false;
      } else if (msg.type === 'game:reveal') {
        stopTimer();
        lifelines = msg.lifelines || lifelines;
        updateHeaderStats(msg.newScore, msg.streak);
        showFeedbackScreen(msg);
      } else if (msg.type === 'game:finished') {
        applyFinishedScreen(msg);
      }
    });
  }

  // =========================================================
  // TRANSPORTE 2: HTTP Serverless (Vercel)
  // =========================================================
  async function apiPost(payload) {
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }

  async function connectHttp(pin, name) {
    const msg = await apiPost({
      action: 'player:join',
      pin,
      name,
      avatar: selectedAvatar,
      playerId
    });

    if (msg.error) {
      $('join-error').textContent = msg.error;
      $('join-error').hidden = false;
      SoundFX.wrong();
      return;
    }

    playerId = msg.playerId;
    roomPin = msg.pin;
    playerName = msg.name;
    sessionStorage.setItem('linux_arena_pid', playerId);
    sessionStorage.setItem('linux_arena_pin', roomPin);
    sessionStorage.setItem('linux_arena_name', playerName);

    $('header-player-name').textContent = playerName;
    $('header-sub').textContent = `Sala ${roomPin}`;
    lifelines = msg.lifelines || lifelines;
    updateHeaderStats(msg.score || 0, msg.streak || 0);
    $('lobby-count').textContent = String(msg.playerCount || 1);
    $('lobby-mascot').innerHTML = MascotUI.renderMascot('happy', 96);
    if (msg.phase === 'lobby') {
      showScreen('lobby');
      SoundFX.join();
    }

    lastPhaseKey = null;
    if (pollHandle) clearInterval(pollHandle);
    await pollPlayerState();
    pollHandle = setInterval(pollPlayerState, 900);
  }

  async function pollPlayerState() {
    if (mode !== 'live' || !roomPin || !playerId) return;
    try {
      const res = await fetch(
        `/api/game?role=player&pin=${encodeURIComponent(roomPin)}&playerId=${encodeURIComponent(playerId)}`
      );
      if (!res.ok) return;
      const st = await res.json();
      if (st.error) return;

      const phaseKey = `${st.phase}:${st.roundId}`;
      if (st.phase === 'lobby') {
        $('lobby-count').textContent = String(st.playerCount || 1);
        if (lastPhaseKey !== phaseKey) {
          lastPhaseKey = phaseKey;
          stopTimer();
          lifelines = st.lifelines || lifelines;
          updateHeaderStats(st.score, st.streak);
          showScreen('lobby');
        }
      } else if (st.phase === 'question') {
        if (lastPhaseKey !== phaseKey) {
          lastPhaseKey = phaseKey;
          applyQuestionScreen(st);
        } else {
          paused = !!st.paused;
          if (Math.abs(remainingSec - st.remainingSec) > 1.8) {
            remainingSec = st.remainingSec;
          }
        }
      } else if (st.phase === 'reveal') {
        if (lastPhaseKey !== phaseKey) {
          lastPhaseKey = phaseKey;
          stopTimer();
          lifelines = st.lifelines || lifelines;
          updateHeaderStats(st.score, st.streak);
          showFeedbackScreen({
            status: st.status,
            pointsEarned: st.pointsEarned,
            newScore: st.score,
            streak: st.streak,
            correctIndex: st.correctIndex,
            correctOptionText: st.correctOptionText,
            explanation: st.explanation,
            rank: st.rank,
            totalPlayers: st.playerCount
          });
        }
      } else if (st.phase === 'finished') {
        if (lastPhaseKey !== phaseKey) {
          lastPhaseKey = phaseKey;
          applyFinishedScreen({
            rank: st.rank,
            totalPlayers: st.playerCount,
            correctCount: st.correctCount,
            totalQuestions: st.total,
            score: st.score,
            bestStreak: st.bestStreak
          });
        }
      }
    } catch (_) {}
  }

  async function detectTransport() {
    if (transportChecked) return transport;
    try {
      const info = await fetch('/api/info').then((r) => r.json());
      transport = info.mode === 'vercel' ? 'http' : 'ws';
    } catch (_) {
      transport = location.protocol === 'https:' ? 'http' : 'ws';
    }
    transportChecked = true;
    return transport;
  }

  async function connectLive(pin, name) {
    mode = 'live';
    $('join-error').hidden = true;
    const t = await detectTransport();
    if (t === 'http') {
      await connectHttp(pin, name);
    } else {
      connectWS(pin, name);
    }
  }

  // =========================================================
  // MODO TREINO SOLO (Offline)
  // =========================================================
  function startSoloMode() {
    mode = 'solo';
    if (pollHandle) clearInterval(pollHandle);
    const all = (window.LINUX_QUIZ_QUESTIONS || []).slice();
    const byDiff = { easy: [], medium: [], hard: [], million: [] };
    all.forEach((q) => (byDiff[q.difficulty] || byDiff.medium).push(q));
    const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);
    soloQuestions = [
      ...shuffle(byDiff.easy),
      ...shuffle(byDiff.medium),
      ...shuffle(byDiff.hard),
      ...shuffle(byDiff.million)
    ];
    soloIndex = 0;
    soloScore = 0;
    soloStreak = 0;
    soloBestStreak = 0;
    soloCorrect = 0;
    lifelines = { cards: true, hint: true, skip: true, double: true };

    $('header-player-name').textContent = $('input-name').value.trim() || 'Aluno Solo';
    $('header-sub').textContent = 'Treino Solo • 32 Questões';
    updateHeaderStats(0, 0);
    loadSoloQuestion();
  }

  function loadSoloQuestion() {
    const q = soloQuestions[soloIndex];
    chosenIndex = null;
    eliminatedSet = new Set();
    doubleActive = false;
    paused = false;
    currentOptions = q.options;

    $('play-q-num').textContent = `${soloIndex + 1} / ${soloQuestions.length}`;
    $('play-q-tier').textContent = q.difficulty === 'million' ? '👑 Nível Milhão' : '🦉 Revisão';
    $('play-q-module').textContent = q.module;
    $('play-q-text').textContent = q.question;
    $('play-hint-box').hidden = true;
    $('play-waiting-ack').hidden = true;

    renderLifelines();
    renderMobileOptions(false);
    showScreen('question');
    startTimer(35, 35);
    SoundFX.questionStart();
  }

  function finishSoloQuestion(choice, skipped = false) {
    stopTimer();
    const q = soloQuestions[soloIndex];
    let status = 'timeout';
    let earned = 0;

    if (skipped) {
      status = 'skipped';
      earned = 250;
      soloScore += earned;
    } else if (choice !== null) {
      if (choice === q.correct) {
        status = 'correct';
        soloCorrect++;
        soloStreak++;
        if (soloStreak > soloBestStreak) soloBestStreak = soloStreak;
        const speedBonus = Math.round(500 * (remainingSec / totalSec));
        const streakBonus = Math.min(soloStreak - 1, 5) * 150;
        earned = (1000 + speedBonus + streakBonus) * (doubleActive ? 2 : 1);
        soloScore += earned;
      } else {
        status = 'wrong';
        soloStreak = 0;
      }
    } else {
      soloStreak = 0;
    }

    updateHeaderStats(soloScore, soloStreak);
    showFeedbackScreen({
      status,
      pointsEarned: earned,
      newScore: soloScore,
      streak: soloStreak,
      correctIndex: q.correct,
      correctOptionText: q.options[q.correct],
      explanation: q.explanation
    });
  }

  // =========================================================
  // Eventos de UI
  // =========================================================
  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    SoundFX.tap();
    const pin = $('input-pin').value.trim();
    const name = $('input-name').value.trim();
    connectLive(pin, name);
  });

  $('btn-start-solo').addEventListener('click', () => {
    SoundFX.tap();
    startSoloMode();
  });

  $('play-options').addEventListener('click', async (e) => {
    const btn = e.target.closest('.mobile-opt-btn');
    if (!btn || btn.disabled) return;
    const choice = Number(btn.dataset.choice);
    SoundFX.tap();

    if (mode === 'live') {
      chosenIndex = choice;
      renderMobileOptions(true);
      renderLifelines();
      $('play-waiting-ack').hidden = false;
      if (transport === 'http') {
        await apiPost({ action: 'player:answer', pin: roomPin, playerId, choice });
        await pollPlayerState();
      } else {
        ws?.send(JSON.stringify({ type: 'player:answer', choice }));
      }
    } else {
      chosenIndex = choice;
      finishSoloQuestion(choice, false);
    }
  });

  async function useLifeline(kind) {
    if (chosenIndex !== null || !lifelines[kind]) return;
    SoundFX.lifeline();

    if (mode === 'live') {
      if (transport === 'http') {
        const res = await apiPost({ action: 'player:lifeline', pin: roomPin, playerId, lifeline: kind });
        if (res.error) return;
        lifelines = res.lifelines || lifelines;
        if (kind === 'cards') {
          (res.eliminated || []).forEach((i) => eliminatedSet.add(i));
          renderMobileOptions(false);
        } else if (kind === 'hint') {
          $('play-hint-text').textContent = res.hint;
          $('play-hint-box').hidden = false;
        } else if (kind === 'double') {
          doubleActive = true;
        } else if (kind === 'skip') {
          chosenIndex = -1;
          renderMobileOptions(true);
          $('play-waiting-ack').hidden = false;
        }
        renderLifelines();
        await pollPlayerState();
      } else {
        ws?.send(JSON.stringify({ type: 'player:lifeline', lifeline: kind }));
      }
      return;
    }

    lifelines[kind] = false;
    const q = soloQuestions[soloIndex];
    if (kind === 'cards') {
      const wrong = [0, 1, 2, 3, 4].filter((i) => i !== q.correct).sort(() => Math.random() - 0.5);
      const count = Math.random() < 0.45 ? 3 : 2;
      wrong.slice(0, count).forEach((i) => eliminatedSet.add(i));
      renderMobileOptions(false);
    } else if (kind === 'hint') {
      $('play-hint-text').textContent = q.hint;
      $('play-hint-box').hidden = false;
    } else if (kind === 'double') {
      doubleActive = true;
    } else if (kind === 'skip') {
      finishSoloQuestion(null, true);
    }
    renderLifelines();
  }

  $('life-cards').addEventListener('click', () => useLifeline('cards'));
  $('life-hint').addEventListener('click', () => useLifeline('hint'));
  $('life-double').addEventListener('click', () => useLifeline('double'));
  $('life-skip').addEventListener('click', () => useLifeline('skip'));

  $('btn-solo-next').addEventListener('click', () => {
    SoundFX.tap();
    soloIndex++;
    if (soloIndex >= soloQuestions.length) {
      $('finish-mascot').innerHTML = MascotUI.renderMascot('crown', 105);
      $('finish-title').textContent = '🎉 Revisão Completa!';
      $('finish-stats').textContent = `Você acertou ${soloCorrect} de ${soloQuestions.length} questões!`;
      $('finish-score-pill').textContent = `${soloScore.toLocaleString('pt-BR')} pts`;
      $('finish-streak-pill').textContent = `🔥 Melhor combo: ${soloBestStreak}`;
      $('btn-finish-home').hidden = false;
      showScreen('finished');
      SoundFX.podium();
      launchConfetti();
    } else {
      loadSoloQuestion();
    }
  });

  $('btn-finish-home').addEventListener('click', () => {
    SoundFX.tap();
    startSoloMode();
  });

  const params = new URLSearchParams(location.search);
  if (params.get('mode') === 'solo') {
    startSoloMode();
  } else {
    detectTransport();
    showScreen('join');
  }
})();
