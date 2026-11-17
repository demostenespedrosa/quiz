/**
 * Sintetizador de efeitos sonoros via Web Audio API (zero arquivos MP3 externos).
 * Combina feedbacks estilo Duolingo (alegres e táteis) com suspense Show do Milhão.
 */
(function (global) {
  'use strict';

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
      try {
        this.muted = localStorage.getItem('linux_arena_muted') === '1';
      } catch (_) {}
    }

    ensureContext() {
      if (this.muted) return null;
      if (!this.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    setMuted(flag) {
      this.muted = !!flag;
      try {
        localStorage.setItem('linux_arena_muted', this.muted ? '1' : '0');
      } catch (_) {}
    }

    toggleMute() {
      this.setMuted(!this.muted);
      return this.muted;
    }

    tone(freq, duration = 0.12, type = 'sine', gainVal = 0.14, delay = 0) {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    tap() {
      this.tone(520, 0.055, 'triangle', 0.1);
    }

    join() {
      this.tone(523.25, 0.09, 'sine', 0.12, 0);
      this.tone(659.25, 0.12, 'sine', 0.12, 0.07);
    }

    correct(streak = 1) {
      // Estilo Duolingo "ding-ding!" com pitch crescente no combo
      const boost = Math.min(streak - 1, 6) * 28;
      this.tone(587.33 + boost, 0.12, 'triangle', 0.16, 0);
      this.tone(880 + boost, 0.22, 'triangle', 0.18, 0.09);
      if (streak >= 3) {
        this.tone(1174.66 + boost, 0.26, 'sine', 0.14, 0.18);
      }
    }

    wrong() {
      // Som suave de erro sem ser estridente
      this.tone(240, 0.16, 'sawtooth', 0.08, 0);
      this.tone(185, 0.24, 'sawtooth', 0.08, 0.12);
    }

    tick(urgent = false) {
      this.tone(urgent ? 880 : 620, 0.045, 'sine', urgent ? 0.1 : 0.05);
    }

    questionStart() {
      // Abertura estilo Show do Milhão + Kahoot
      this.tone(392.0, 0.1, 'triangle', 0.13, 0);
      this.tone(493.88, 0.1, 'triangle', 0.13, 0.09);
      this.tone(587.33, 0.12, 'triangle', 0.14, 0.18);
      this.tone(783.99, 0.24, 'triangle', 0.16, 0.27);
    }

    lifeline() {
      this.tone(659.25, 0.08, 'sine', 0.12, 0);
      this.tone(783.99, 0.08, 'sine', 0.12, 0.07);
      this.tone(1046.5, 0.18, 'sine', 0.14, 0.14);
    }

    podium() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
      const times = [0, 0.11, 0.22, 0.34, 0.52, 0.66];
      notes.forEach((n, idx) => {
        this.tone(n, idx === notes.length - 1 ? 0.45 : 0.15, 'triangle', 0.16, times[idx]);
      });
    }
  }

  global.SoundFX = new SoundEngine();
})(typeof window !== 'undefined' ? window : globalThis);
