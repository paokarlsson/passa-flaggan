// Skärmarna i Hemlig omröstning. Ritar utifrån spelmotorns fas (js/vote.js).
import { VOTE_RULES } from './vote.js';
import { esc, flagImg, categoryLabel, promptHtml, answersHtml, revealHtml } from './view.js';
import * as icon from './icons.js';

// Insatserna och vad de betyder.
const BETS = { 1: 'Gissar', 2: 'Tror det', 3: 'Säker!' };

// ui: { draft: valt alternativ eller null, menu: om menyn är öppen, sound: ljudknappens html }
export function renderVote(v, ui) {
  let html;
  const chip = `<p class="chip">Fråga ${v.number} av ${v.total}</p>`;

  if (v.phase === 'handover') {
    const p = v.voter();
    html = `
      <section class="screen center handover">
        ${menuButton()}
        ${chip}
        <p class="hint">${v.answered() === 0 ? 'Först ut att svara' : `${v.answered()} av ${v.players.length} har svarat. Ge mobilen till`}</p>
        <p class="sticker giant">${esc(p.alias)}</p>
        <button type="button" class="btn big show-question">Jag är ${esc(p.alias)}, visa frågan!</button>
        <p class="hint">Titta inte när någon annan svarar.</p>
      </section>`;
  } else if (v.phase === 'answer') {
    const q = v.question;
    const p = v.voter();
    html = `
      <section class="screen question vote-answer cat-${q.category}">
        <header class="topbar">
          <span class="holder"><strong>${esc(p.alias)}</strong> svarar i hemlighet</span>
        </header>
        ${v.categories.length > 1 ? `<p class="cat-chip cat-${q.category}">${categoryLabel(q.category)}</p>` : ''}
        <div class="prompt">${promptHtml(q)}</div>
        ${answersHtml(q, v.view())}
        <section class="bets" aria-label="Insats">
          <p class="section-title">Hur säker är du? <span>${ui.draft === null ? 'välj ett svar först' : 'satsa och lås'}</span></p>
          <div class="bet-row">
            ${Object.entries(BETS)
              .map(
                ([bet, label]) => `<button type="button" class="bet bet-${bet}" data-bet="${bet}" ${ui.draft === null ? 'disabled' : ''}>
                  <strong>${bet}</strong><span>${label}</span></button>`,
              )
              .join('')}
          </div>
        </section>
      </section>`;
  } else if (v.phase === 'ready') {
    html = `
      <section class="screen center vote-ready">
        ${menuButton()}
        ${chip}
        <div class="ballot-idle">${icon.ballot(150)}</div>
        <p class="sticker lead"><strong>Alla har svarat!</strong></p>
        <p class="hint">Lägg mobilen i mitten så att alla ser.</p>
        <button type="button" class="btn big reveal-all">Visa svaren!</button>
      </section>`;
  } else if (v.phase === 'reveal') {
    const last = v.number >= v.total;
    html = `
      <section class="screen center vote-reveal">
        ${chip}
        ${revealHtml(v.question.reveal)}
        <ul class="votes">
          ${v.results.map((r) => voteRow(v, r)).join('')}
        </ul>
        <button type="button" class="btn big next-question">${last ? 'Se vinnaren!' : 'Nästa fråga'}</button>
      </section>`;
  } else if (v.phase === 'over') {
    const winners = v.winners();
    html = `
      <section class="screen center over">
        <canvas class="confetti"></canvas>
        <p class="chip">${winners.length > 1 ? 'Delad seger' : 'Vinnare'}</p>
        <div class="trophy">${icon.trophy(130)}</div>
        <p class="sticker giant">${winners.map((p) => esc(p.alias)).join(' & ')}</p>
        ${scoreList(v)}
        <button type="button" class="btn big rematch">Revansch</button>
        <button type="button" class="btn ghost edit">Ändra spelare</button>
      </section>`;
  }

  if (ui.menu) {
    html += `
      <div class="overlay">
        <div class="dialog">
          <p class="sticker lead">Paus</p>
          <button type="button" class="btn big resume">Fortsätt</button>
          ${ui.sound}
          <button type="button" class="btn ghost quit">Avsluta match</button>
        </div>
      </div>`;
  }
  return html;
}

const menuButton = () =>
  `<button type="button" class="pause corner" aria-label="Paus">${icon.pause()}</button>`;

// En rad per spelare: namn, svaret, insatsen och poängen.
function voteRow(v, r) {
  const p = v.players[r.id];
  const o = v.question.options[r.choice];
  const thumb = o.flag ? flagImg(o.flag, 'flag thumb') : '';
  const name = o.text ?? o.flag.namn;
  return `
    <li class="vote ${r.correct ? 'right' : 'miss'}">
      <span class="vote-name">${esc(p.alias)}</span>
      <span class="vote-choice">${thumb}<span>${esc(name)}</span></span>
      <span class="vote-points">${r.points > 0 ? '+' : '−'}${Math.abs(r.points)}</span>
      <span class="vote-total">${score(p.score)} p</span>
    </li>`;
}

function scoreList(v) {
  return `
    <ol class="scores">
      ${v
        .standings()
        .map((p) => `<li class="tile"><span class="tile-name">${esc(p.alias)}</span><strong>${score(p.score)} p</strong></li>`)
        .join('')}
    </ol>`;
}

const score = (n) => (n < 0 ? `−${-n}` : `${n}`);

// Reglerna på startskärmen.
export const VOTE_RULES_HTML = `
  <li>Alla får samma fråga. Mobilen går runt och var och en svarar i hemlighet.</li>
  <li>Välj svar och satsa ${VOTE_RULES.minBet}–${VOTE_RULES.maxBet} poäng på hur säker du är. Rätt ger insatsen, fel drar av den.</li>
  <li>När alla har svarat läggs mobilen i mitten och allas svar visas samtidigt.</li>
  <li>Ingen tidsgräns. Flest poäng efter sista frågan vinner.</li>
  <li>Frågorna blir svårare mot slutet. Nivån styr antalet svarsalternativ: Barn 3, Normal 4, Nörd 6.</li>`;
