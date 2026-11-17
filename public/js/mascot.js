/**
 * Mascote Tuxling (pinguim estilo Duolingo) + 8 avatares SVG colecionáveis para os alunos.
 */
(function (global) {
  'use strict';

  const AVATARS = [
    { id: 'penguin', label: 'Tux', bg: '#DDF4FF', accent: '#1CB0F6' },
    { id: 'owl', label: 'Coruja', bg: '#E5FFCC', accent: '#58CC02' },
    { id: 'fox', label: 'Raposa', bg: '#FFF0D6', accent: '#FF9600' },
    { id: 'robot', label: 'Daemon', bg: '#F3E8FF', accent: '#CE82FF' },
    { id: 'cat', label: 'Gato Root', bg: '#FFE4E6', accent: '#FF4B4B' },
    { id: 'dragon', label: 'Kernel', bg: '#FEF3C7', accent: '#FFC800' },
    { id: 'rocket', label: 'Turbo', bg: '#E0F2FE', accent: '#0EA5E9' },
    { id: 'shield', label: 'Netfilter', bg: '#DCFCE7', accent: '#22C55E' }
  ];

  function renderMascot(mood = 'idle', size = 110) {
    // mood: 'idle' | 'happy' | 'thinking' | 'oops' | 'crown'
    const isHappy = mood === 'happy' || mood === 'crown';
    const isOops = mood === 'oops';
    const isThinking = mood === 'thinking';

    const eyeLeft = isHappy
      ? '<path d="M36 46 Q41 40 46 46" stroke="#1E293B" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
      : isOops
      ? '<path d="M37 42 L45 50 M45 42 L37 50" stroke="#1E293B" stroke-width="3.2" stroke-linecap="round"/>'
      : '<circle cx="41" cy="46" r="4.5" fill="#1E293B"/><circle cx="42.5" cy="44.3" r="1.6" fill="#FFF"/>';

    const eyeRight = isHappy
      ? '<path d="M64 46 Q69 40 74 46" stroke="#1E293B" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
      : isOops
      ? '<path d="M65 42 L73 50 M73 42 L65 50" stroke="#1E293B" stroke-width="3.2" stroke-linecap="round"/>'
      : '<circle cx="69" cy="46" r="4.5" fill="#1E293B"/><circle cx="70.5" cy="44.3" r="1.6" fill="#FFF"/>';

    const crown =
      mood === 'crown'
        ? '<path d="M36 22 L42 9 L55 18 L68 9 L74 22 Z" fill="#FFC800" stroke="#E5A500" stroke-width="2.5" stroke-linejoin="round"/>'
        : '';

    const brow = isThinking
      ? '<path d="M34 36 Q41 33 47 37" stroke="#58CC02" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M63 35 Q70 31 76 35" stroke="#58CC02" stroke-width="3" fill="none" stroke-linecap="round"/>'
      : '';

    const wingLeft = isHappy
      ? '<ellipse cx="20" cy="60" rx="10" ry="18" transform="rotate(-35 20 60)" fill="#334155"/>'
      : '<ellipse cx="22" cy="72" rx="9" ry="17" transform="rotate(14 22 72)" fill="#334155"/>';

    const wingRight = isHappy
      ? '<ellipse cx="90" cy="60" rx="10" ry="18" transform="rotate(35 90 60)" fill="#334155"/>'
      : '<ellipse cx="88" cy="72" rx="9" ry="17" transform="rotate(-14 88 72)" fill="#334155"/>';

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 110 110" aria-hidden="true" class="mascot-svg mascot-${mood}">
        ${crown}
        ${wingLeft}
        ${wingRight}
        <ellipse cx="55" cy="64" rx="33" ry="37" fill="#1E293B"/>
        <ellipse cx="55" cy="69" rx="24" ry="28" fill="#FFFFFF"/>
        <!-- Máscara estilo coruja Duolingo em verde Linux -->
        <circle cx="41" cy="46" r="13" fill="#58CC02"/>
        <circle cx="69" cy="46" r="13" fill="#58CC02"/>
        <circle cx="41" cy="46" r="9.5" fill="#FFFFFF"/>
        <circle cx="69" cy="46" r="9.5" fill="#FFFFFF"/>
        ${eyeLeft}
        ${eyeRight}
        ${brow}
        <!-- Bico -->
        <path d="M47 54 Q55 62 63 54 Q55 48 47 54 Z" fill="#FF9600"/>
        <path d="M49 55 Q55 60 61 55" stroke="#E07A00" stroke-width="1.5" fill="none"/>
        <!-- Patinhas -->
        <ellipse cx="42" cy="100" rx="10" ry="5.5" fill="#FF9600"/>
        <ellipse cx="68" cy="100" rx="10" ry="5.5" fill="#FF9600"/>
      </svg>
    `;
  }

  function renderAvatar(avatarId = 'penguin', size = 44) {
    const info = AVATARS.find((a) => a.id === avatarId) || AVATARS[0];
    const glyphs = {
      penguin: '<circle cx="24" cy="24" r="13" fill="#1E293B"/><circle cx="20" cy="21" r="4" fill="#FFF"/><circle cx="28" cy="21" r="4" fill="#FFF"/><circle cx="20" cy="21" r="2" fill="#1E293B"/><circle cx="28" cy="21" r="2" fill="#1E293B"/><path d="M20 26 Q24 31 28 26 Z" fill="#FF9600"/>',
      owl: '<circle cx="24" cy="25" r="13" fill="#58CC02"/><circle cx="19" cy="22" r="5" fill="#FFF"/><circle cx="29" cy="22" r="5" fill="#FFF"/><circle cx="19" cy="22" r="2.2" fill="#1E293B"/><circle cx="29" cy="22" r="2.2" fill="#1E293B"/><polygon points="24,25 21,29 27,29" fill="#FF9600"/>',
      fox: '<polygon points="12,13 20,18 14,25" fill="#FF9600"/><polygon points="36,13 28,18 34,25" fill="#FF9600"/><circle cx="24" cy="26" r="12" fill="#FF9600"/><path d="M14 27 Q24 37 34 27 Q24 30 14 27 Z" fill="#FFF"/><circle cx="20" cy="23" r="2" fill="#1E293B"/><circle cx="28" cy="23" r="2" fill="#1E293B"/><circle cx="24" cy="29" r="2.2" fill="#1E293B"/>',
      robot: '<rect x="13" y="15" width="22" height="20" rx="6" fill="#A855F7"/><line x1="24" y1="9" x2="24" y2="15" stroke="#7E22CE" stroke-width="2.5"/><circle cx="24" cy="9" r="2.5" fill="#FFC800"/><rect x="17" y="21" width="4.5" height="4.5" rx="1" fill="#FFF"/><rect x="26.5" y="21" width="4.5" height="4.5" rx="1" fill="#FFF"/><rect x="18" y="29" width="12" height="2.5" rx="1.2" fill="#FFF"/>',
      cat: '<polygon points="13,13 20,19 14,25" fill="#FF4B4B"/><polygon points="35,13 28,19 34,25" fill="#FF4B4B"/><circle cx="24" cy="26" r="12" fill="#FF4B4B"/><circle cx="20" cy="24" r="2.2" fill="#FFF"/><circle cx="28" cy="24" r="2.2" fill="#FFF"/><polygon points="24,27 22,29.5 26,29.5" fill="#FFC800"/>',
      dragon: '<polygon points="15,12 20,19 13,22" fill="#E5A500"/><polygon points="33,12 28,19 35,22" fill="#E5A500"/><circle cx="24" cy="26" r="12" fill="#FFC800"/><circle cx="20" cy="23" r="2.2" fill="#1E293B"/><circle cx="28" cy="23" r="2.2" fill="#1E293B"/><path d="M19 30 Q24 33 29 30" stroke="#1E293B" stroke-width="2" fill="none" stroke-linecap="round"/>',
      rocket: '<path d="M24 10 C30 16 31 25 28 33 L20 33 C17 25 18 16 24 10 Z" fill="#1CB0F6"/><circle cx="24" cy="22" r="3.5" fill="#FFF"/><path d="M20 33 L24 39 L28 33 Z" fill="#FF9600"/>',
      shield: '<path d="M24 11 L35 16 V25 C35 32 24 37 24 37 C24 37 13 32 13 25 V16 Z" fill="#22C55E"/><path d="M19 24 L23 28 L30 20" stroke="#FFF" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    };

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true" class="avatar-svg">
        <circle cx="24" cy="24" r="23" fill="${info.bg}" stroke="${info.accent}" stroke-width="2.5"/>
        ${glyphs[info.id] || glyphs.penguin}
      </svg>
    `;
  }

  global.MascotUI = { AVATARS, renderMascot, renderAvatar };
})(typeof window !== 'undefined' ? window : globalThis);
