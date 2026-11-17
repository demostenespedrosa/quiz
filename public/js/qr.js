/**
 * Gerador de QR Code SVG 100% offline (Model 2, Byte Mode, ECC Level M, Versões 1-6).
 * Zero dependências externas — ideal para redes locais de sala de aula sem internet.
 */
(function (global) {
  'use strict';

  const VERSIONS = [
    null,
    { size: 21, total: 26, data: 16, blocks: 1, ecPerBlock: 10, align: [] },
    { size: 25, total: 44, data: 28, blocks: 1, ecPerBlock: 16, align: [6, 18] },
    { size: 29, total: 70, data: 44, blocks: 1, ecPerBlock: 26, align: [6, 22] },
    { size: 33, total: 100, data: 64, blocks: 2, ecPerBlock: 18, align: [6, 26] },
    { size: 37, total: 134, data: 86, blocks: 2, ecPerBlock: 24, align: [6, 30] },
    { size: 41, total: 172, data: 108, blocks: 4, ecPerBlock: 16, align: [6, 34] }
  ];

  // Tabelas GF(256) com polinômio primitivo 0x11D
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      GF_EXP[i] = GF_EXP[i - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGenerator(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsRemainder(data, ecLen) {
    const gen = rsGenerator(ecLen);
    const res = new Uint8Array(data.length + ecLen);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  function encodeData(bytes, version) {
    const spec = VERSIONS[version];
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };

    // Modo Byte (0100) + tamanho (8 bits para versões 1-9)
    pushBits(0b0100, 4);
    pushBits(bytes.length, 8);
    for (const b of bytes) pushBits(b, 8);

    const maxBits = spec.data * 8;
    const term = Math.min(4, maxBits - bits.length);
    for (let i = 0; i < term; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      codewords.push(byte);
    }

    const pads = [0xec, 0x11];
    let padIdx = 0;
    while (codewords.length < spec.data) {
      codewords.push(pads[padIdx % 2]);
      padIdx++;
    }

    // Divide em blocos e intercala
    const blockLen = spec.data / spec.blocks;
    const dataBlocks = [];
    const ecBlocks = [];
    for (let b = 0; b < spec.blocks; b++) {
      const slice = Uint8Array.from(codewords.slice(b * blockLen, (b + 1) * blockLen));
      dataBlocks.push(slice);
      ecBlocks.push(rsRemainder(slice, spec.ecPerBlock));
    }

    const finalBytes = [];
    for (let i = 0; i < blockLen; i++) {
      for (let b = 0; b < spec.blocks; b++) finalBytes.push(dataBlocks[b][i]);
    }
    for (let i = 0; i < spec.ecPerBlock; i++) {
      for (let b = 0; b < spec.blocks; b++) finalBytes.push(ecBlocks[b][i]);
    }
    return finalBytes;
  }

  function createMatrix(version) {
    const spec = VERSIONS[version];
    const n = spec.size;
    const modules = Array.from({ length: n }, () => new Int8Array(n).fill(-1));
    const reserved = Array.from({ length: n }, () => new Uint8Array(n));

    const setMod = (r, c, val, isReserved = true) => {
      if (r < 0 || c < 0 || r >= n || c >= n) return;
      modules[r][c] = val ? 1 : 0;
      if (isReserved) reserved[r][c] = 1;
    };

    const drawFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r < 0 || c < 0 || r >= n || c >= n) continue;
          const inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          const dark =
            inBox &&
            (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          setMod(r, c, dark ? 1 : 0, true);
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, n - 7);
    drawFinder(n - 7, 0);

    // Timing patterns
    for (let i = 8; i < n - 8; i++) {
      const dark = i % 2 === 0 ? 1 : 0;
      setMod(6, i, dark, true);
      setMod(i, 6, dark, true);
    }

    // Alignment patterns
    if (spec.align.length >= 2) {
      const coords = spec.align;
      for (const r of coords) {
        for (const c of coords) {
          if (reserved[r][c]) continue;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
              setMod(r + dr, c + dc, dark ? 1 : 0, true);
            }
          }
        }
      }
    }

    // Dark module + reservar áreas de formato
    setMod(n - 8, 8, 1, true);
    for (let i = 0; i < 9; i++) {
      if (i !== 6) {
        reserved[8][i] = 1;
        reserved[i][8] = 1;
      }
    }
    for (let i = 0; i < 8; i++) {
      reserved[8][n - 1 - i] = 1;
      if (i < 7) reserved[n - 1 - i][8] = 1;
    }

    return { n, modules, reserved };
  }

  function placeDataBits(mat, codewords) {
    const { n, modules, reserved } = mat;
    const totalBits = codewords.length * 8;
    let bitIdx = 0;
    let dir = -1; // sobe primeiro

    for (let right = n - 1; right > 0; right -= 2) {
      if (right === 6) right--; // pula coluna de timing
      for (let i = 0; i < n; i++) {
        const r = dir === -1 ? n - 1 - i : i;
        for (let dx = 0; dx < 2; dx++) {
          const c = right - dx;
          if (reserved[r][c]) continue;
          let bit = 0;
          if (bitIdx < totalBits) {
            const byte = codewords[bitIdx >>> 3];
            bit = (byte >>> (7 - (bitIdx & 7))) & 1;
            bitIdx++;
          }
          modules[r][c] = bit;
        }
      }
      dir = -dir;
    }
  }

  function formatBits(mask) {
    // ECC Level M = 00
    const data = (0b00 << 3) | mask;
    let rem = data << 10;
    const gen = 0x537;
    for (let i = 14; i >= 10; i--) {
      if ((rem >>> i) & 1) rem ^= gen << (i - 10);
    }
    return ((data << 10) | rem) ^ 0x5412;
  }

  function applyMaskAndFormat(mat, maskId) {
    const { n, modules, reserved } = mat;
    const copy = modules.map((row) => Int8Array.from(row));

    const maskFn = [
      (r, c) => (r + c) % 2 === 0,
      (r) => r % 2 === 0,
      (_, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
      (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
    ][maskId];

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!reserved[r][c] && maskFn(r, c)) {
          copy[r][c] ^= 1;
        }
      }
    }

    const fmt = formatBits(maskId);
    for (let i = 0; i < 15; i++) {
      const bit = (fmt >>> i) & 1;
      // Vertical
      if (i < 6) copy[i][8] = bit;
      else if (i < 8) copy[i + 1][8] = bit;
      else copy[n - 15 + i][8] = bit;
      // Horizontal
      if (i < 8) copy[8][n - 1 - i] = bit;
      else if (i < 9) copy[8][7] = bit;
      else copy[8][14 - i] = bit;
    }

    return copy;
  }

  function penaltyScore(grid) {
    const n = grid.length;
    let score = 0;

    // Regra 1: linhas/colunas consecutivas
    for (let r = 0; r < n; r++) {
      let runR = 1;
      let runC = 1;
      for (let c = 1; c < n; c++) {
        if (grid[r][c] === grid[r][c - 1]) runR++;
        else {
          if (runR >= 5) score += 3 + (runR - 5);
          runR = 1;
        }
        if (grid[c][r] === grid[c - 1][r]) runC++;
        else {
          if (runC >= 5) score += 3 + (runC - 5);
          runC = 1;
        }
      }
      if (runR >= 5) score += 3 + (runR - 5);
      if (runC >= 5) score += 3 + (runC - 5);
    }

    // Regra 2: blocos 2x2
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const v = grid[r][c];
        if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) {
          score += 3;
        }
      }
    }

    return score;
  }

  function generateMatrix(text) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(String(text));

    let version = 1;
    while (version < VERSIONS.length) {
      const cap = VERSIONS[version].data - 2; // 4 bits modo + 8 bits len + 4 bits term = 2 bytes overhead
      if (bytes.length <= cap) break;
      version++;
    }
    if (version >= VERSIONS.length) {
      throw new Error('Texto muito longo para QR offline (máx 106 bytes).');
    }

    const codewords = encodeData(bytes, version);
    const mat = createMatrix(version);
    placeDataBits(mat, codewords);

    let bestGrid = null;
    let bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      const candidate = applyMaskAndFormat(mat, m);
      const s = penaltyScore(candidate);
      if (s < bestScore) {
        bestScore = s;
        bestGrid = candidate;
      }
    }
    return bestGrid;
  }

  function toSVG(text, opts = {}) {
    const grid = generateMatrix(text);
    const n = grid.length;
    const quiet = opts.quiet ?? 2;
    const total = n + quiet * 2;
    const fg = opts.fg || '#1E293B';
    const bg = opts.bg || '#FFFFFF';
    const paths = [];

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (grid[r][c] === 1) {
          paths.push(`M${c + quiet},${r + quiet}h1v1h-1z`);
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR Code para entrar no jogo"><rect width="${total}" height="${total}" fill="${bg}" rx="1.5"/><path d="${paths.join('')}" fill="${fg}"/></svg>`;
  }

  const api = { generateMatrix, toSVG };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.QRGen = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
