// Ikoner som inline-SVG i klistermärkesstil: svart kontur och platt färg.
// Dekorativa ikoner är aria-hidden. Där en ikon bär betydelse sätter anroparen en etikett.

const svg = (size, body, extra = '') =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${body}</svg>`;

const HEART = 'M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z';

export const heart = (full, size = 24) =>
  svg(
    size,
    `<path d="${HEART}" fill="${full ? 'var(--coral)' : '#ffffff'}" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>`,
  );

export const bomb = (size = 96) =>
  `<svg class="icon bomb" width="${size}" height="${size}" viewBox="0 0 96 96" aria-hidden="true">
    <path d="M62 22c6-10 14-12 20-8" fill="none" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>
    <path d="M82 6l3 6 6 1-5 4 1 6-5-3-5 3 1-6-5-4 6-1z" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="50" y="20" width="18" height="14" rx="3" transform="rotate(40 59 27)" fill="var(--ink)"/>
    <circle cx="42" cy="56" r="32" fill="var(--ink)"/>
    <circle cx="31" cy="44" r="9" fill="#ffffff" opacity=".35"/>
  </svg>`;

export const pause = () =>
  svg(22, '<rect x="6" y="5" width="4" height="14" rx="1" fill="var(--ink)"/><rect x="14" y="5" width="4" height="14" rx="1" fill="var(--ink)"/>');

export const ticket = (size = 120) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
    <path d="M14 34h92v16a10 10 0 0 0 0 20v16H14V70a10 10 0 0 0 0-20z" fill="var(--sun)" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round" transform="rotate(-8 60 60)"/>
    <path d="M44 38v44" stroke="var(--ink)" stroke-width="3" stroke-dasharray="5 5" transform="rotate(-8 60 60)"/>
    <path d="M58 60l8 8 16-18" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-8 60 60)"/>
  </svg>`;

export const trophy = (size = 140) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
    <path d="M38 20h44v24a22 22 0 0 1-44 0z" fill="var(--sun)" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>
    <path d="M38 28H24a14 14 0 0 0 16 20M82 28h14a14 14 0 0 1-16 20" fill="none" stroke="var(--ink)" stroke-width="4"/>
    <path d="M54 66h12v18H54z" fill="var(--sun)" stroke="var(--ink)" stroke-width="4"/>
    <rect x="36" y="84" width="48" height="16" rx="4" fill="var(--mint)" stroke="var(--ink)" stroke-width="4"/>
  </svg>`;

// Stjärnan bakom "PANG!".
export const burst = () =>
  `<svg class="burst" viewBox="0 0 320 210" aria-hidden="true">
    <path d="M160 8 L184 62 L244 22 L230 84 L310 80 L250 120 L300 178 L218 160 L206 204 L160 166 L114 204 L102 160 L20 178 L70 120 L10 80 L90 84 L76 22 L136 62 Z" fill="var(--sun)" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>
  </svg>`;

export const speaker = (on) =>
  svg(
    22,
    `<path d="M4 9h4l5-4v14l-5-4H4z" fill="var(--ink)"/>` +
      (on
        ? '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>'
        : '<path d="M16 9l5 6M21 9l-5 6" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>'),
  );

export const close = () =>
  svg(18, '<path d="M6 6l12 12M18 6L6 18" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>');

export const pin = () =>
  `<svg class="icon pin" width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" fill="var(--coral)" stroke="var(--ink)" stroke-width="2"/>
    <circle cx="12" cy="10" r="2.6" fill="#ffffff" stroke="var(--ink)" stroke-width="2"/>
  </svg>`;

// Stora ikoner för frågor som bara är text.
const CATEGORY_ICONS = {
  storst: `<svg class="icon" width="88" height="88" viewBox="0 0 96 96" aria-hidden="true">
      <g transform="rotate(-6 48 48)">
        <rect x="10" y="10" width="76" height="76" rx="8" fill="var(--mint)" stroke="var(--ink)" stroke-width="4"/>
        <path d="M26 70L70 26M70 26H54M70 26V42M26 70h16M26 70V54" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>`,
  folk: `<svg class="icon" width="120" height="80" viewBox="0 0 120 80" aria-hidden="true">
      <circle cx="30" cy="26" r="12" fill="var(--sun)" stroke="var(--ink)" stroke-width="4"/>
      <path d="M10 74a20 20 0 0 1 40 0z" fill="var(--sun)" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>
      <circle cx="90" cy="26" r="12" fill="var(--lilac)" stroke="var(--ink)" stroke-width="4"/>
      <path d="M70 74a20 20 0 0 1 40 0z" fill="var(--lilac)" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>
      <circle cx="60" cy="20" r="14" fill="var(--coral)" stroke="var(--ink)" stroke-width="4"/>
      <path d="M36 74a24 24 0 0 1 48 0z" fill="var(--coral)" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>
    </svg>`,
  kust: `<svg class="icon" width="110" height="88" viewBox="0 0 120 96" aria-hidden="true">
      <rect x="6" y="6" width="108" height="84" rx="14" fill="#ffffff" stroke="var(--ink)" stroke-width="4"/>
      <path d="M18 40c8-8 16-8 24 0s16 8 24 0 16-8 24 0 12 6 12 6M18 60c8-8 16-8 24 0s16 8 24 0 16-8 24 0 12 6 12 6" fill="none" stroke="#2d8fd6" stroke-width="6" stroke-linecap="round"/>
      <path d="M22 22L98 76" stroke="var(--coral)" stroke-width="8" stroke-linecap="round"/>
    </svg>`,
};

export const category = (id) => CATEGORY_ICONS[id] ?? '';
