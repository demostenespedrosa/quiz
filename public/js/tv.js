/**
 * Lógica da Tela da TV / Professor (tv.html)
 * Detecta automaticamente:
 *  - Modo Local (node server.js): WebSocket em tempo real + seletor de IP LAN
 *  - Modo Vercel (nuvem): Serverless HTTP (/api/game) com URL externa HTTPS
 */
(function () {
  'use strict';

  const LETTERS = ['A', 'B', 'C', 'D', 'E'];
  const $ = (id) => document.getElementById(id);

  let transport = 'ws'; // 'ws' | 'http'
  let ws = null;
  let pollHandle = null;
  let roomPin = sessionStorage.getItem('linux_arena_host_pin') || null;
  let hostToken = sessionStorage.getItem('linux_arena_host_token') || null;
  let detectedIps = [];
  let serverPort = location.port || 3000;
  let currentQuestion = null;
  let totalTimeSec = 30;
  let remainingSec = 30;
  let paused = false;
  let localTimer = null;
  let lastRoundKey = null;
  let lastAnsweredCount = -1;

  $('tv-brand-mascot').innerHTML = MascotUI.renderMascot('idle', 52);

  function showPhase(phase) {
    $('tv-lobby').hidden = phase !== 'lobby';
    $('tv-question').hidden = phase !== 'question';
    $('tv-reveal').hidden = phase !== 'reveal';
    $('tv-podium').hidden = phase !== 'finished';
    $('btn-reset-room').hidden = phase === 'lobby';
  }

  function updateSoundBtn() {
    const muted = SoundFX.muted;
    $('btn-mute').textContent = muted ? '🔇 Mudo' : '🔊 Som';
    $('btn-mute').setAttribute('aria-pressed', String(muted));
  }
  updateSoundBtn();

  $('btn-mute').addEventListener('click', () => {
    SoundFX.toggleMute();
    updateSoundBtn();
    SoundFX.tap();
  });

  function renderQRAndUrl() {
    if (!roomPin) return;
    let joinUrl;
    if (transport === 'http' || (location.protocol === 'https:' && location.hostname !== 'localhost')) {
      joinUrl = `${location.origin}/play?pin=${roomPin}`;
    } else {
      const selectedHost = $('ip-select').value || location.hostname || 'localhost';
      const portPart = serverPort ? `:${serverPort}` : '';
      joinUrl = `${location.protocol}//${selectedHost}${portPart}/play?pin=${roomPin}`;
    }
    $('lobby-url').textContent = joinUrl;
    try {
      $('lobby-qr').innerHTML = QRGen.toSVG(joinUrl);
    } catch (_) {
      $('lobby-qr').innerHTML = `<p style="color:#dc2626;font-weight:700;">Use o link abaixo e o PIN ${roomPin}</p>`;
    }
  }

  function populateIpSelect(ips) {
    detectedIps = ips || [];
    const sel = $('ip-select');
    sel.innerHTML = '';
    if (detectedIps.length === 0) {
      const opt = document.createElement('option');
      opt.value = location.hostname || 'localhost';
      opt.textContent = `${opt.value} (Local)`;
      sel.appendChild(opt);
    } else {
      detectedIps.forEach((entry) => {
        const opt = document.createElement('option');
        opt.value = entry.ip;
        opt.textContent = `${entry.ip} — ${entry.name}`;
        sel.appendChild(opt);
      });
    }
    renderQRAndUrl();
  }

  $('ip-select').addEventListener('change', renderQRAndUrl);

  function stopLocalTimer() {
    if (localTimer) {
      clearInterval(localTimer);
      localTimer = null;
    }
  }

  function startLocalTimer(sec) {
    stopLocalTimer();
    remainingSec = sec;
    renderTimerUI();
    localTimer = setInterval(() => {
      if (paused) return;
      remainingSec = Math.max(0, remainingSec - 0.2);
      renderTimerUI();
      if (remainingSec <= 5 && remainingSec > 0 && Math.abs(remainingSec - Math.round(remainingSec)) < 0.15) {
        SoundFX.tick(true);
      }
      if (remainingSec <= 0) {
        stopLocalTimer();
      }
    }, 200);
  }

  function renderTimerUI() {
    const rounded = Math.ceil(remainingSec);
    const timerEl = $('tv-timer');
    timerEl.textContent = String(rounded);
    timerEl.classList.toggle('is-urgent', rounded <= 5);

    const pct = Math.max(0, Math.min(100, (remainingSec / Math.max(1, totalTimeSec)) * 100));
    const fill = $('tv-progress-fill');
    fill.style.inlineSize = `${pct}%`;
    fill.classList.toggle('is-warning', pct <= 45 && pct > 20);
    fill.classList.toggle('is-danger', pct <= 20);
  }

  function renderOptions(container, options, correctIndex = null, distribution = null) {
    const totalVotes = distribution ? distribution.reduce((a, b) => a + b, 0) : 0;
    container.innerHTML = options
      .map((text, idx) => {
        const isCorrect = correctIndex !== null && idx === correctIndex;
        const isDimmed = correctIndex !== null && idx !== correctIndex;
        const votes = distribution ? distribution[idx] : 0;
        const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        const countBadge =
          distribution !== null
            ? `<span class="tv-option__count">${isCorrect ? '✅ ' : ''}${votes} (${pct}%)</span>`
            : '';
        return `
          <div class="tv-option tv-option--${idx} ${isCorrect ? 'is-correct' : ''} ${isDimmed ? 'is-dimmed' : ''}">
            <span class="tv-option__letter">${LETTERS[idx]}</span>
            <span>${escapeHtml(text)}</span>
            ${countBadge}
          </div>
        `;
      })
      .join('');
  }

  function renderRankingRows(container, list) {
    if (!list || list.length === 0) {
      container.innerHTML = '<p style="color:var(--ink-muted);font-weight:700;">Nenhum jogador pontuou ainda.</p>';
      return;
    }
    container.innerHTML = list
      .map((p) => {
        const topCls = p.rank <= 3 ? `rank-row--${p.rank}` : '';
        const deltaHtml =
          p.rankDelta > 0
            ? `<span class="rank-delta rank-delta--up">▲ +${p.rankDelta}</span>`
            : p.rankDelta < 0
            ? `<span class="rank-delta rank-delta--down">▼ ${p.rankDelta}</span>`
            : '';
        const streakHtml = p.streak >= 2 ? `<span class="duo-pill duo-pill--orange">🔥 ${p.streak}</span>` : '';
        return `
          <div class="rank-row ${topCls}">
            <span class="rank-pos">${p.rank}</span>
            ${MascotUI.renderAvatar(p.avatar, 36)}
            <span style="font-size: 1.05rem;">${escapeHtml(p.name)}</span>
            ${streakHtml}
            ${deltaHtml}
            <span class="rank-score">${p.score.toLocaleString('pt-BR')} pts</span>
          </div>
        `;
      })
      .join('');
  }

  function launchConfetti() {
    const layer = $('confetti-layer');
    layer.innerHTML = '';
    const colors = ['#58cc02', '#1cb0f6', '#ffc800', '#ff9600', '#a855f7', '#ff4b4b'];
    for (let i = 0; i < 65; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.insetInlineStart = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 1.1}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      layer.appendChild(piece);
    }
    setTimeout(() => {
      layer.innerHTML = '';
    }, 3800);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function updateLobbyPlayers(players) {
    const prevCount = Number($('lobby-player-count').textContent) || 0;
    $('lobby-player-count').textContent = String(players.length);
    $('btn-start-game').disabled = players.length === 0;

    if (players.length > prevCount) {
      SoundFX.join();
    }

    if (players.length === 0) {
      $('lobby-players-grid').innerHTML =
        '<p style="color: #94a3b8; font-weight: 700;">Peça aos alunos para escanearem o QR Code ou digitarem o PIN no celular!</p>';
      return;
    }

    $('lobby-players-grid').innerHTML = players
      .map(
        (p) => `
        <div class="player-chip ${p.connected === false ? 'is-offline' : ''}">
          ${MascotUI.renderAvatar(p.avatar, 34)}
          <span>${escapeHtml(p.name)}</span>
        </div>
      `
      )
      .join('');
  }

  function applyQuestionView(msg) {
    currentQuestion = msg.question;
    totalTimeSec = msg.totalTimeSec || msg.timeSec;
    paused = !!msg.paused;
    $('btn-pause').textContent = paused ? '▶️ Retomar Tempo' : '⏸️ Pausar Tempo';

    $('q-counter').textContent = `Pergunta ${msg.index + 1} / ${msg.total}`;
    $('q-module').textContent = msg.question.module;
    $('q-tier').textContent = msg.tier.isFinal
      ? '👑 PERGUNTA DO MILHÃO! (2x Pontos)'
      : msg.tier.isMilestone
      ? `⭐ Marco ${msg.tier.label} (1.5x)`
      : `🏆 Patamar: ${msg.tier.label}`;
    $('q-answered-count').textContent = String(msg.answeredCount || 0);
    $('q-total-players').textContent = String(msg.totalPlayers || msg.playerCount || 0);
    $('tv-question-text').textContent = msg.question.question;
    renderOptions($('tv-options-grid'), msg.question.options);

    showPhase('question');
    startLocalTimer(msg.remainingSec ?? msg.timeSec);
    SoundFX.questionStart();
  }

  function applyRevealView(msg) {
    stopLocalTimer();
    const opts = msg.question ? msg.question.options : currentQuestion?.options;
    if (opts) {
      renderOptions($('tv-reveal-options'), opts, msg.correctIndex, msg.distribution);
    }
    $('reveal-mascot').innerHTML = MascotUI.renderMascot('happy', 66);
    $('tv-explanation-text').textContent = msg.explanation;
    $('tv-hint-text').textContent = `🦉 Analogia: ${msg.hint}`;
    $('reveal-stats-pill').textContent = `${msg.answeredCount}/${msg.totalPlayers ?? msg.playerCount} responderam`;
    renderRankingRows($('tv-ranking-list'), msg.ranking);
    $('btn-next-question').textContent =
      msg.index + 1 >= msg.total ? '🏆 Ver Pódio Final' : '➡️ Próxima Pergunta';
    showPhase('reveal');
    SoundFX.correct(2);
  }

  function applyFinishedView(msg) {
    stopLocalTimer();
    $('podium-mascot').innerHTML = MascotUI.renderMascot('crown', 110);
    const top3 = (msg.ranking || []).slice(0, 3);
    const medals = ['🥇 1º Lugar', '🥈 2º Lugar', '🥉 3º Lugar'];
    const totalQ = msg.totalQuestions ?? msg.total ?? 16;
    $('podium-stage').innerHTML = top3
      .map(
        (p, idx) => `
        <div class="podium-pillar podium-pillar--${idx + 1}">
          <span class="duo-pill duo-pill--gold">${medals[idx]}</span>
          ${MascotUI.renderAvatar(p.avatar, idx === 0 ? 74 : 58)}
          <strong style="font-size: 1.2rem;">${escapeHtml(p.name)}</strong>
          <span style="font-family: var(--font-display); font-size: 1.45rem;">${p.score.toLocaleString('pt-BR')} pts</span>
          <span style="font-size: 0.85rem; font-weight: 800; color: var(--ink-muted);">
            ✅ ${p.correctCount}/${totalQ} • 🔥 Melhor combo: ${p.bestStreak}
          </span>
        </div>
      `
      )
      .join('');
    renderRankingRows($('final-ranking-list'), msg.ranking || []);
    showPhase('finished');
    SoundFX.podium();
    launchConfetti();
  }

  // =========================================================
  // TRANSPORTE 1: WebSocket (Servidor Local LAN)
  // =========================================================
  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}`);

    ws.addEventListener('open', () => {
      $('tv-ws-status').textContent = '🟢 Servidor Local (Tempo Real)';
      $('tv-ws-status').className = 'duo-pill duo-pill--green';
      ws.send(JSON.stringify({ type: 'host:create', pin: roomPin }));
    });

    ws.addEventListener('close', () => {
      $('tv-ws-status').textContent = '🔴 Reconectando...';
      $('tv-ws-status').className = 'duo-pill duo-pill--red';
      setTimeout(connectWS, 1500);
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (_) {
        return;
      }

      if (msg.type === 'host:ready') {
        roomPin = msg.pin;
        sessionStorage.setItem('linux_arena_host_pin', roomPin);
        serverPort = msg.port || serverPort;
        $('lobby-pin').textContent = roomPin;
        $('top-pin-val').textContent = roomPin;
        $('tv-top-pin').hidden = false;
        populateIpSelect(msg.ips);
        updateLobbyPlayers(msg.players || []);
        if (msg.phase === 'lobby') showPhase('lobby');
      } else if (msg.type === 'room:players') {
        updateLobbyPlayers(msg.players || []);
      } else if (msg.type === 'game:question') {
        applyQuestionView(msg);
      } else if (msg.type === 'room:answer_progress') {
        $('q-answered-count').textContent = String(msg.answeredCount);
        $('q-total-players').textContent = String(msg.totalPlayers);
        SoundFX.tap();
      } else if (msg.type === 'game:paused') {
        paused = msg.paused;
        $('btn-pause').textContent = paused ? '▶️ Retomar Tempo' : '⏸️ Pausar Tempo';
      } else if (msg.type === 'game:reveal') {
        applyRevealView(msg);
      } else if (msg.type === 'game:finished') {
        applyFinishedView(msg);
      } else if (msg.type === 'host:back_to_lobby') {
        stopLocalTimer();
        showPhase('lobby');
      }
    });
  }

  // =========================================================
  // TRANSPORTE 2: HTTP Serverless (Vercel + Upstash Redis)
  // =========================================================
  async function apiPost(payload) {
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }

  async function initHttpMode(hasRedis) {
    transport = 'http';
    $('ip-field-wrap').hidden = true;
    $('lobby-access-label').textContent = 'Acesse de qualquer celular (Wi-Fi ou 4G/5G):';

    $('tv-ws-status').textContent = hasRedis
      ? '☁️ Nuvem Vercel + Redis Ativo'
      : '🟡 Vercel sem Redis (Configure Upstash)';
    $('tv-ws-status').className = `duo-pill ${hasRedis ? 'duo-pill--green' : 'duo-pill--orange'}`;

    const created = await apiPost({
      action: 'host:create',
      pin: roomPin,
      hostToken
    });

    if (created.error) {
      $('tv-ws-status').textContent = `🔴 ${created.error}`;
      $('tv-ws-status').className = 'duo-pill duo-pill--red';
      return;
    }

    roomPin = created.pin;
    hostToken = created.hostToken;
    sessionStorage.setItem('linux_arena_host_pin', roomPin);
    sessionStorage.setItem('linux_arena_host_token', hostToken);

    $('lobby-pin').textContent = roomPin;
    $('top-pin-val').textContent = roomPin;
    $('tv-top-pin').hidden = false;
    renderQRAndUrl();

    await pollHostState();
    pollHandle = setInterval(pollHostState, 900);
  }

  async function pollHostState() {
    if (!roomPin) return;
    try {
      const res = await fetch(
        `/api/game?role=host&pin=${encodeURIComponent(roomPin)}&hostToken=${encodeURIComponent(hostToken || '')}`
      );
      if (!res.ok) return;
      const st = await res.json();
      if (st.error) return;

      const phaseKey = `${st.phase}:${st.roundId}`;
      if (st.phase === 'lobby') {
        if (lastRoundKey !== phaseKey) {
          stopLocalTimer();
          showPhase('lobby');
          lastRoundKey = phaseKey;
        }
        updateLobbyPlayers(st.players || []);
      } else if (st.phase === 'question') {
        if (lastRoundKey !== phaseKey) {
          lastRoundKey = phaseKey;
          lastAnsweredCount = st.answeredCount || 0;
          applyQuestionView(st);
        } else {
          if (st.answeredCount !== lastAnsweredCount) {
            lastAnsweredCount = st.answeredCount;
            SoundFX.tap();
          }
          $('q-answered-count').textContent = String(st.answeredCount || 0);
          $('q-total-players').textContent = String(st.playerCount || 0);
          paused = !!st.paused;
          $('btn-pause').textContent = paused ? '▶️ Retomar Tempo' : '⏸️ Pausar Tempo';
          if (Math.abs(remainingSec - st.remainingSec) > 1.8) {
            remainingSec = st.remainingSec;
          }
        }
      } else if (st.phase === 'reveal') {
        if (lastRoundKey !== phaseKey) {
          lastRoundKey = phaseKey;
          applyRevealView(st);
        }
      } else if (st.phase === 'finished') {
        if (lastRoundKey !== phaseKey) {
          lastRoundKey = phaseKey;
          applyFinishedView(st);
        }
      }
    } catch (_) {}
  }

  async function sendHostAction(action, extra = {}) {
    SoundFX.tap();
    if (transport === 'ws') {
      if (!ws || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: action, ...extra }));
      return;
    }
    await apiPost({ action, pin: roomPin, hostToken, ...extra });
    await pollHostState();
  }

  $('btn-start-game').addEventListener('click', () => {
    sendHostAction('host:start', {
      config: {
        count: Number($('cfg-count').value),
        timePerQuestion: Number($('cfg-time').value),
        moduleFilter: $('cfg-module').value
      }
    });
  });

  $('btn-pause').addEventListener('click', () => sendHostAction('host:pause'));
  $('btn-reveal-now').addEventListener('click', () => sendHostAction('host:reveal'));
  $('btn-next-question').addEventListener('click', () => sendHostAction('host:next'));
  $('btn-reset-room').addEventListener('click', () => sendHostAction('host:restart'));
  $('btn-play-again').addEventListener('click', () => sendHostAction('host:restart'));

  // Inicialização: detecta se está rodando na Vercel ou localmente
  fetch('/api/info')
    .then((r) => r.json())
    .then((info) => {
      if (info.mode === 'vercel') {
        initHttpMode(!!info.hasRedis);
      } else {
        transport = 'ws';
        connectWS();
      }
    })
    .catch(() => {
      transport = 'ws';
      connectWS();
    });
})();
