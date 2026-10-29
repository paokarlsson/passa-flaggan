// Byggstenar som båda spelen ritar med: frågor, svarsknappar och facit.
import { CATEGORIES } from './categories.js';
import * as icon from './icons.js';

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const flagImg = (c, cls = 'flag') =>
  `<img class="${cls}" src="flaggor/${c.id}.svg" alt="Flagga" draggable="false">`;
export const silhouetteImg = (c) =>
  `<img class="silhouette" src="siluetter/${c.id}.svg" alt="Ett lands form" draggable="false">`;
export const categoryLabel = (id) => CATEGORIES[id].chip ?? CATEGORIES[id].label;

// Det som frågas om: flagga, siluett eller text, med frågetext före och efter.
export function promptHtml(q) {
  const s = q.subject;
  let html = '';
  if (s.flag && s.small) html += `<div class="flag-sticker small">${flagImg(s.flag)}</div>`;
  if (s.icon) html += `<div class="prompt-icon">${icon.category(s.icon)}</div>`;
  if (q.ask) html += `<p class="ask">${esc(q.ask)}</p>`;
  if (s.flag && !s.small) html += `<div class="flag-sticker">${flagImg(s.flag, 'flag hero')}</div>`;
  if (s.silhouette) html += `<div class="silhouette-sticker">${silhouetteImg(s.silhouette)}</div>`;
  if (s.text) {
    const sentence = !s.flag && !q.ask && !s.pin;
    html += `<p class="country ${sentence ? 'sentence' : ''}">${s.pin ? icon.pin() : ''}${esc(s.text)}</p>`;
  }
  if (q.after) html += `<p class="ask">${esc(q.after)}</p>`;
  return html;
}

// shown: vilka alternativ (index i q.options) som visas. Knappens data-i är alltid index i q.options.
export function answersHtml(q, shown = q.options.map((_, i) => i)) {
  const n = shown.length;
  const style = q.optionStyle === 'flag' ? 'flags' : q.optionStyle === 'textflag' ? 'names textflag' : 'names';
  const button = (i) => {
    const o = q.options[i];
    if (q.optionStyle === 'flag') {
      return `<button type="button" class="answer" data-i="${i}" aria-label="Alternativ ${i + 1}">${flagImg(o.flag)}</button>`;
    }
    const thumb = q.optionStyle === 'textflag' ? flagImg(o.flag, 'flag thumb') : '';
    return `<button type="button" class="answer" data-i="${i}">${thumb}<span>${esc(o.text)}</span></button>`;
  };
  return `<div class="answers ${style} n${n}">${shown.map(button).join('')}</div>`;
}

// Facit.
export function revealHtml(r) {
  if (r.bars) {
    return `
      <div class="reveal bars">
        <p class="reveal-title">${esc(r.label)}</p>
        ${r.bars
          .map(
            (b) => `
          <div class="bar-row ${b.correct ? 'correct' : ''}">
            <div class="bar-text"><span>${esc(b.text)}</span><span>${esc(b.valueText)}</span></div>
            <div class="bar" style="width: ${Math.max(3, Math.round(b.share * 100))}%"></div>
          </div>`,
          )
          .join('')}
      </div>`;
  }
  const picture = r.silhouette ? silhouetteImg(r.silhouette) : r.flag ? flagImg(r.flag) : '';
  return `
    <div class="reveal">
      ${picture}
      <div>
        <p class="reveal-label">${esc(r.label)}</p>
        <p class="reveal-name ${r.small ? 'small' : ''}">${esc(r.name)}</p>
      </div>
    </div>`;
}
