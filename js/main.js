// Gränssnittet: lobbyn och båda spelen. Ritar skärmarna utifrån spelmotorernas
// fas och styr ljudet.
import { Game, RULES } from './game.js';
import { VoteGame, QUESTION_COUNTS, VOTE_RULES } from './vote.js';
import { LEVELS, levelForAge } from './questions.js';
import { CATEGORIES } from './categories.js';
import { AudioEngine, vibrate } from './audio.js';
import { esc, categoryLabel, promptHtml, answersHtml, revealHtml } from './view.js';
import { renderVote, VOTE_RULES_HTML } from './vote-view.js';
import * as icon from './icons.js';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const STORAGE_KEY = 'passa-flaggan:spelare';
const CATEGORY_KEY = 'passa-flaggan:kategorier';
const MATCH_KEY = 'passa-flaggan:match';
const VOTE_KEY = 'passa-flaggan:omrostning';
const QUESTIONS_KEY = 'passa-flaggan:antal-fragor';
const SAVE_INTERVAL_MS = 1000;
// Spärr mot att någon i farten råkar trycka på nästa skärms knapp.
const HANDOVER_GUARD_MS = 500;
const EXPLOSION_GUARD_MS = 1500;

const app = document.getElementById('app');
const flashEl = document.getElementById('flash');

let countries = [];
let mode = null; // spelet som valts i lobbyn: 'bomb' eller 'vote', null = lobbyn
let game = null; // pågående match i Passa flaggan
let vote = null; // pågående match i Hemlig omröstning
let voteChoice = null; // alternativet som den som svarar har valt men inte låst
let voteMenu = false;
let setupPlayers = loadPlayers();
let setupCategories = loadCategories();
let setupQuestions = loadQuestions();
let pendingCategories = []; // det den som sprängdes väljer för nästa runda
let rendered = null; // vad som senast ritades, för att veta när skärmen behöver ritas om
let freezing = false; // pausen mellan att bomben smäller och att smällen visas
let guardUntil = 0;
let wakeLock = null;
let savedAt = 0;

const audio = new AudioEngine();
// Mobilen vibrerar i takt med pulsen, starkare mot slutet.
audio.onBeat = (p) => {
  if (p > 0.3) vibrate(Math.round(10 + 50 * p));
};

// ---------- Hjälpare ----------

// Hjärtan för liv kvar och tomma för förlorade. Den som är ute får en etikett i stället.
const hearts = (lives) =>
  lives > 0
    ? `<span class="hearts" role="img" aria-label="${lives} liv kvar">${Array.from({ length: RULES.lives }, (_, i) =>
        icon.heart(i < lives, 22),
      )
        .join('')}</span>`
    : '<span class="out-tag">Ute</span>';

function loadPlayers() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length >= MIN_PLAYERS) return saved.slice(0, MAX_PLAYERS);
  } catch {
    // Ingen lagring tillgänglig, börja tomt.
  }
  return [newPlayer(), newPlayer()];
}

function savePlayers() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setupPlayers));
  } catch {
    // Inte viktigt om det inte går att spara.
  }
}

function loadCategories() {
  try {
    const saved = JSON.parse(localStorage.getItem(CATEGORY_KEY));
    const valid = Array.isArray(saved) ? saved.filter((c) => c in CATEGORIES) : [];
    if (valid.length) return valid;
  } catch {
    // Ingen lagring tillgänglig.
  }
  return ['flaggor'];
}

function saveCategories() {
  try {
    localStorage.setItem(CATEGORY_KEY, JSON.stringify(setupCategories));
  } catch {
    // Inte viktigt om det inte går att spara.
  }
}

function loadQuestions() {
  try {
    const saved = Number(localStorage.getItem(QUESTIONS_KEY));
    if (QUESTION_COUNTS.includes(saved)) return saved;
  } catch {
    // Ingen lagring tillgänglig.
  }
  return VOTE_RULES.questions;
}

function saveQuestions() {
  try {
    localStorage.setItem(QUESTIONS_KEY, String(setupQuestions));
  } catch {
    // Inte viktigt om det inte går att spara.
  }
}

// Matchen sparas så att den kan fortsätta om appen eller webbläsaren stängs.
function saveMatch() {
  savedAt = performance.now();
  try {
    if (game) localStorage.setItem(MATCH_KEY, JSON.stringify(game.snapshot()));
    else localStorage.removeItem(MATCH_KEY);
    if (vote) localStorage.setItem(VOTE_KEY, JSON.stringify(vote.snapshot()));
    else localStorage.removeItem(VOTE_KEY);
  } catch {
    // Ingen lagring: matchen går inte att fortsätta, men spelet fungerar.
  }
}

function loadMatch() {
  try {
    return Game.restore(JSON.parse(localStorage.getItem(MATCH_KEY)), { countries });
  } catch {
    return null;
  }
}

function loadVote() {
  try {
    return VoteGame.restore(JSON.parse(localStorage.getItem(VOTE_KEY)), { countries });
  } catch {
    return null;
  }
}

function newPlayer() {
  return { alias: '', age: '', level: 'normal', manual: false };
}

function flash(kind, text = '') {
  flashEl.className = '';
  void flashEl.offsetWidth; // starta om animationen
  flashEl.className = `show ${kind}`;
  flashEl.textContent = text;
}

async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {
    wakeLock = null;
  }
}

// ---------- Skärmar ----------

// Lobbyn: välj vilket av spelen ni ska spela.
function renderLobby() {
  app.innerHTML = `
    <section class="screen lobby">
      <header class="logo">
        <h1>Flaggspel</h1>
        <p class="tagline">En mobil, ett helt sällskap. Välj spel!</p>
      </header>
      <button type="button" class="game-card pick-game bomb-card" data-mode="bomb">
        <span class="game-icon">${icon.bomb(76)}</span>
        <span class="game-text">
          <span class="game-title">Passa flaggan</span>
          <span class="game-desc">Svara rätt och skicka bomben vidare innan den smäller.</span>
          <span class="game-tag">Snabbt och nervigt</span>
        </span>
      </button>
      <button type="button" class="game-card pick-game vote-card" data-mode="vote">
        <span class="game-icon">${icon.ballot(76)}</span>
        <span class="game-text">
          <span class="game-title">Hemlig omröstning</span>
          <span class="game-desc">Alla svarar i smyg på samma fråga och satsar 1–3 poäng. Sedan visas allas svar.</span>
          <span class="game-tag">Lugnt och taktiskt</span>
        </span>
      </button>
      ${soundToggle()}
      ${creditsHtml()}
    </section>`;
  rendered = { screen: 'lobby' };
}

function creditsHtml() {
  return `
    <details class="credits">
      <summary>Källor och licenser</summary>
      <p>Flaggor: <a href="https://github.com/lipis/flag-icons">lipis/flag-icons</a> (MIT).
      Landsdata: <a href="https://github.com/mledoze/countries">mledoze/countries</a> (ODbL).
      Musik skapad med Suno. Typsnitt: Lilita One och Nunito (SIL Open Font License).</p>
    </details>`;
}

const BOMB_RULES_HTML = `
  <li>Alla börjar med 3 liv. Bomben har en dold timer. Första rundan är den 2–4 minuter, och varje runda blir lite kortare.</li>
  <li>De första varven tickar bomben lugnt. Sedan går det allt fortare.</li>
  <li>Svara rätt så blinkar skärmen grönt. Skicka mobilen till den vars namn visas.</li>
  <li>Fel svar ger 1 sekunds spärr och drar 3 sekunder från bomben.</li>
  <li>Ibland får man ett frikort och kan skicka vidare direkt.</li>
  <li>Den som håller mobilen när det smäller förlorar ett liv. Sist kvar vinner!</li>
  <li>Första rundan är lätt, och för varje runda blir länderna mer okända och svarsalternativen mer lika varandra.</li>
  <li>Kryssa i en eller flera kategorier. Den som sprängs väljer en eller två av dem till nästa runda.</li>
  <li>Nivån styr antalet svarsalternativ: Barn 3, Normal 4, Nörd 6. Barn får också lättare länder.</li>
  <li>Slå på ljudet (och stäng av ljudlöst läge på iPhone) för full effekt.</li>`;

function renderSetup() {
  const canStart =
    setupPlayers.length >= MIN_PLAYERS && setupPlayers.every((p) => p.alias.trim().length > 0);
  const isVote = mode === 'vote';
  app.innerHTML = `
    <section class="screen setup">
      <button type="button" class="back">← Välj spel</button>
      <header class="logo">
        ${
          isVote
            ? `<div class="logo-bomb">${icon.ballot(88)}</div>
        <h1>Hemlig omröstning</h1>
        <p class="tagline">Svara i smyg, satsa på hur säker du är och avslöja allt samtidigt!</p>`
            : `<div class="logo-bomb">${icon.bomb(88)}</div>
        <h1>Passa flaggan</h1>
        <p class="tagline">Gissa flaggan och skicka bomben vidare innan den smäller!</p>`
        }
      </header>
      <ol class="players">
        ${setupPlayers
          .map(
            (p, i) => `
          <li class="player-row" data-i="${i}">
            <input class="alias" type="text" placeholder="Spelare ${i + 1}" maxlength="14"
              value="${esc(p.alias)}" autocomplete="off" enterkeyhint="next" aria-label="Alias">
            <input class="age" type="number" inputmode="numeric" placeholder="Ålder" min="1" max="120"
              value="${esc(p.age)}" aria-label="Ålder">
            <div class="levels" role="radiogroup" aria-label="Nivå">
              ${Object.entries(LEVELS)
                .map(
                  ([key, l]) =>
                    `<button type="button" class="level ${p.level === key ? 'on' : ''}" data-level="${key}"
                      role="radio" aria-checked="${p.level === key}">${l.label}</button>`,
                )
                .join('')}
            </div>
            ${setupPlayers.length > MIN_PLAYERS ? `<button type="button" class="remove" aria-label="Ta bort spelare">${icon.close()}</button>` : ''}
          </li>`,
          )
          .join('')}
      </ol>
      ${setupPlayers.length < MAX_PLAYERS ? `<button type="button" class="btn ghost add">+ Lägg till spelare</button>` : ''}
      <section class="categories">
        <p class="section-title">Kategorier <span>blandas fråga för fråga</span></p>
        <div class="category-grid">
          ${Object.keys(CATEGORIES)
            .map(
              (id) => `<button type="button" class="cat cat-${id} ${setupCategories.includes(id) ? 'on' : ''}"
                data-cat="${id}" aria-pressed="${setupCategories.includes(id)}">${CATEGORIES[id].label}</button>`,
            )
            .join('')}
        </div>
      </section>
      ${
        isVote
          ? `<section class="categories question-count">
        <p class="section-title">Antal frågor</p>
        <div class="count-grid" role="radiogroup" aria-label="Antal frågor">
          ${QUESTION_COUNTS.map(
            (n) => `<button type="button" class="count ${n === setupQuestions ? 'on' : ''}" data-count="${n}"
              role="radio" aria-checked="${n === setupQuestions}">${n}</button>`,
          ).join('')}
        </div>
      </section>`
          : ''
      }
      <button type="button" class="btn big start" ${canStart ? '' : 'disabled'}>Starta match</button>
      ${soundToggle()}
      <details class="rules">
        <summary>Så spelar man</summary>
        <ul>${isVote ? VOTE_RULES_HTML : BOMB_RULES_HTML}</ul>
      </details>
      ${creditsHtml()}
    </section>`;
  rendered = { screen: 'setup' };
}

function renderGame() {
  const g = game;
  const holder = g.player();
  let html;

  if (g.phase === 'intro') {
    html = `
      <section class="screen center intro">
        <p class="chip">Runda ${g.round + 1}</p>
        <div class="bomb-idle">${icon.bomb(150)}</div>
        <p class="sticker lead"><strong>${esc(holder.alias)}</strong> börjar</p>
        ${g.round > 0 && g.categories.length > 1 ? chooserHtml(holder) : '<p class="hint">Sätt er i en ring. Tryck när alla är redo.</p>'}
        <button type="button" class="btn big go">Tänd stubinen!</button>
        ${livesList()}
      </section>`;
  } else if (g.phase === 'handover') {
    html = `
      <section class="screen center handover">
        <p class="chip">Skicka till</p>
        <p class="sticker giant">${esc(holder.alias)}</p>
        <button type="button" class="btn big ready">Jag är ${esc(holder.alias)}, visa frågan!</button>
      </section>`;
  } else if (g.phase === 'question' && g.current.type === 'frikort') {
    html = `
      <section class="screen center frikort">
        ${topBar()}
        <div class="card">
          <div class="card-icon">${icon.ticket(140)}</div>
          <p class="card-title">Frikort!</p>
          <p class="hint">Du slipper svara. Skicka bomben vidare direkt.</p>
        </div>
        <button type="button" class="btn big use-card">Skicka vidare!</button>
      </section>`;
  } else if (g.phase === 'question') {
    const q = g.current;
    html = `
      <section class="screen question cat-${q.category}">
        ${topBar()}
        ${g.categories.length > 1 ? `<p class="cat-chip cat-${q.category}">${categoryLabel(q.category)}</p>` : ''}
        <div class="prompt">${promptHtml(q)}</div>
        ${answersHtml(q)}
      </section>`;
  } else if (g.phase === 'exploded') {
    const e = g.explosion;
    const loser = g.player(e.loser);
    const q = e.question;
    let reveal = '';
    if (e.duringHandover) {
      reveal = `<p class="sticker note">Bomben small medan mobilen skickades!</p>`;
    } else if (q) {
      reveal = revealHtml(q.reveal);
    }
    const chooser = g.player(g.chooser);
    const button =
      g.winner !== null
        ? `<button type="button" class="btn big next">Se vinnaren!</button>`
        : `<button type="button" class="btn big next">${esc(chooser.alias)}, kör igen!</button>`;
    html = `
      <section class="screen center exploded">
        <div class="boom">${icon.burst()}<span>PANG!</span></div>
        <div class="sticker loser">
          <p class="loser-name">${esc(loser.alias)}</p>
          <p>${e.out ? 'är ute!' : 'tappade ett hjärta'}</p>
        </div>
        ${reveal}
        ${livesList(e.loser)}
        ${button}
      </section>`;
  } else if (g.phase === 'over') {
    const w = g.player(g.winner);
    html = `
      <section class="screen center over">
        <canvas class="confetti"></canvas>
        <p class="chip">Vinnare</p>
        <div class="trophy">${icon.trophy(150)}</div>
        <p class="sticker giant">${esc(w.alias)}</p>
        <button type="button" class="btn big rematch">Revansch</button>
        <button type="button" class="btn ghost edit">Ändra spelare</button>
      </section>`;
  }

  if (g.paused) {
    html += `
      <div class="overlay">
        <div class="dialog">
          <p class="sticker lead">Pausat</p>
          <button type="button" class="btn big resume">Fortsätt</button>
          ${soundToggle()}
          <button type="button" class="btn ghost quit">Avsluta match</button>
        </div>
      </div>`;
  }

  if (g.phase === 'question' && g.current.type === 'frikort' && rendered?.current !== g.current) audio.card();
  app.innerHTML = html;
  rendered = { screen: 'game', phase: g.phase, current: g.current, holder: g.holder, paused: !!g.paused };
  if (g.phase === 'over') startConfetti(app.querySelector('.confetti'));
}

// Den som sprängdes väljer en eller två kategorier till nästa runda.
function chooserHtml(chooser) {
  return `
    <section class="chooser">
      <p class="section-title">${esc(chooser.alias)} väljer kategori <span>en eller två</span></p>
      <div class="category-grid">
        ${game.categories
          .map(
            (id) => `<button type="button" class="cat cat-${id} pick ${pendingCategories.includes(id) ? 'on' : ''}"
              data-cat="${id}" aria-pressed="${pendingCategories.includes(id)}">${CATEGORIES[id].label}</button>`,
          )
          .join('')}
      </div>
    </section>`;
}

function soundToggle() {
  return `<button type="button" class="btn ghost sound" aria-pressed="${audio.enabled}">
    ${icon.speaker(audio.enabled)} ${audio.enabled ? 'Ljud på' : 'Ljud av'}</button>`;
}

function topBar() {
  const p = game.player();
  return `
    <header class="topbar">
      <span class="holder"><strong>${esc(p.alias)}</strong> har bomben</span>
      ${hearts(p.lives)}
      <button type="button" class="pause" aria-label="Pausa">${icon.pause()}</button>
    </header>`;
}

function livesList(highlight = null) {
  return `
    <ul class="lives-list">
      ${game.players
        .map(
          (p) => `<li class="tile ${p.lives === 0 ? 'out' : ''} ${p.id === highlight ? 'hit' : ''}">
            <span class="tile-name">${esc(p.alias)}</span>${hearts(p.lives)}</li>`,
        )
        .join('')}
    </ul>`;
}

function render() {
  reloadIfIdle();
  if (game) renderGame();
  else if (vote) renderVoteGame();
  else if (mode) renderSetup();
  else renderLobby();
  // Bakgrundsfärgen följer skärmen (t.ex. korallröd vid smällen).
  document.body.dataset.screen = game ? game.phase : vote ? `vote-${vote.phase}` : mode ? 'setup' : 'lobby';
  // Menymusik i lobbyn, vinnarlåten när matchen är avgjord, annars ingen musik.
  const over = game?.phase === 'over' || vote?.phase === 'over';
  audio.setMusic(over ? 'vinnare' : game || vote ? null : 'meny');
  saveMatch();
}

function renderVoteGame() {
  const v = vote;
  app.innerHTML = renderVote(v, { menu: voteMenu, sound: soundToggle(), draft: voteChoice });
  if (v.phase === 'answer' && voteChoice !== null) markChoice();
  if (v.phase === 'over') startConfetti(app.querySelector('.confetti'));
  rendered = { screen: 'vote', phase: v.phase };
}

// Markerar det valda alternativet och låser upp insatserna, utan att rita om frågan.
function markChoice() {
  app.querySelectorAll('.answer').forEach((b) => {
    const on = Number(b.dataset.i) === voteChoice;
    b.classList.toggle('picked', on);
    b.setAttribute('aria-pressed', on);
  });
  app.querySelectorAll('.bet').forEach((b) => (b.disabled = voteChoice === null));
  const hint = app.querySelector('.bets .section-title span');
  if (hint) hint.textContent = 'satsa och lås';
}

// ---------- Händelser ----------

app.addEventListener('input', (ev) => {
  const row = ev.target.closest('.player-row');
  if (!row) return;
  const p = setupPlayers[Number(row.dataset.i)];
  if (ev.target.classList.contains('alias')) p.alias = ev.target.value;
  if (ev.target.classList.contains('age')) {
    p.age = ev.target.value;
    if (!p.manual) {
      p.level = levelForAge(parseInt(p.age, 10));
      row.querySelectorAll('.level').forEach((b) => {
        b.classList.toggle('on', b.dataset.level === p.level);
        b.setAttribute('aria-checked', b.dataset.level === p.level);
      });
    }
  }
  savePlayers();
  const start = app.querySelector('.start');
  if (start) start.disabled = !setupPlayers.every((x) => x.alias.trim().length > 0);
});

app.addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  if (!t || t.disabled) return;

  if (vote) {
    voteClick(t);
    return;
  }

  if (!game && !mode) {
    if (t.classList.contains('pick-game')) {
      mode = t.dataset.mode;
      history.pushState({ setup: true }, '');
    } else if (t.classList.contains('sound')) {
      toggleSound();
      return;
    }
    render();
    window.scrollTo(0, 0);
    return;
  }

  if (!game) {
    const row = t.closest('.player-row');
    if (t.classList.contains('back')) {
      mode = null;
      render();
      return;
    } else if (t.classList.contains('count')) {
      setupQuestions = Number(t.dataset.count);
      saveQuestions();
      renderSetup();
      return;
    } else if (t.classList.contains('level')) {
      const p = setupPlayers[Number(row.dataset.i)];
      p.level = t.dataset.level;
      p.manual = true;
    } else if (t.classList.contains('remove')) {
      setupPlayers.splice(Number(row.dataset.i), 1);
    } else if (t.classList.contains('add')) {
      setupPlayers.push(newPlayer());
      savePlayers();
      renderSetup();
      app.querySelectorAll('.alias')[setupPlayers.length - 1].focus();
      return;
    } else if (t.classList.contains('start')) {
      startMatch();
      return;
    } else if (t.classList.contains('sound')) {
      toggleSound();
      return;
    } else if (t.classList.contains('cat')) {
      // Minst en kategori måste vara ikryssad.
      const id = t.dataset.cat;
      if (setupCategories.includes(id)) {
        if (setupCategories.length > 1) setupCategories = setupCategories.filter((c) => c !== id);
      } else {
        setupCategories = [...setupCategories, id];
      }
      saveCategories();
      renderSetup();
      return;
    }
    savePlayers();
    renderSetup();
    return;
  }

  audio.unlock();
  // En match som fortsätter efter att appen stängts har inte startat ljud och skärmlås än.
  audio.keepAlive();
  keepAwake();
  if (performance.now() < guardUntil) return;
  const g = game;

  if (t.classList.contains('sound')) {
    toggleSound();
    return;
  } else if (t.classList.contains('pick')) {
    pickCategory(t.dataset.cat);
    return;
  } else if (t.classList.contains('pause')) {
    g.pause();
  } else if (t.classList.contains('resume')) {
    g.resume();
  } else if (t.classList.contains('quit')) {
    endMatch();
  } else if (t.classList.contains('go')) {
    if (g.round > 0) g.chooseCategories(pendingCategories);
    g.startRound();
  } else if (t.classList.contains('ready')) {
    g.ready();
  } else if (t.classList.contains('use-card')) {
    if (g.useFrikort()) passed();
  } else if (t.classList.contains('answer')) {
    const result = g.answer(Number(t.dataset.i));
    if (result === 'correct') {
      passed();
    } else if (result === 'wrong') {
      audio.wrong();
      vibrate([80, 40, 80]);
      flash('wrong', 'FEL!');
      t.classList.add('wrong');
      app.querySelectorAll('.answer').forEach((b) => (b.disabled = true));
      update();
      return; // ny fråga ritas när spärren släpper
    }
  } else if (t.classList.contains('next')) {
    g.nextRound();
    if (g.phase === 'over') vibrate([100, 50, 100, 50, 300]);
  } else if (t.classList.contains('rematch')) {
    g.newMatch();
  } else if (t.classList.contains('edit')) {
    endMatch();
    return;
  }
  update(true);
});

function voteClick(t) {
  audio.unlock();
  keepAwake();
  if (performance.now() < guardUntil) return;
  const v = vote;

  if (t.classList.contains('sound')) {
    toggleSound();
    return;
  } else if (t.classList.contains('pause')) {
    voteMenu = true;
  } else if (t.classList.contains('resume')) {
    voteMenu = false;
  } else if (t.classList.contains('quit')) {
    endMatch();
    return;
  } else if (t.classList.contains('show-question')) {
    voteChoice = null;
    v.show();
  } else if (t.classList.contains('answer')) {
    voteChoice = Number(t.dataset.i);
    vibrate(15);
    markChoice();
    return;
  } else if (t.classList.contains('bet')) {
    if (!v.vote(voteChoice, Number(t.dataset.bet))) return;
    voteChoice = null;
    audio.correct();
    vibrate(60);
    flash('right', 'LÅST!');
    guardUntil = performance.now() + HANDOVER_GUARD_MS;
  } else if (t.classList.contains('reveal-all')) {
    v.reveal();
    audio.card();
    vibrate([60, 40, 60]);
  } else if (t.classList.contains('next-question')) {
    v.next();
    if (v.phase === 'over') vibrate([100, 50, 100, 50, 300]);
  } else if (t.classList.contains('rematch')) {
    v.newMatch();
  } else if (t.classList.contains('edit')) {
    endMatch();
    return;
  }
  render();
  window.scrollTo(0, 0);
}

function passed() {
  if (game.phase !== 'handover') return;
  audio.correct();
  vibrate(60);
  flash('right', 'SKICKA!');
  guardUntil = performance.now() + HANDOVER_GUARD_MS;
}

// Bomben har smällt. Vem som förlorade är redan avgjort, men först fryser allt:
// ljudet tystnar och skärmen dimmas. Smällen visas när ljudet når högtalaren,
// så att bild och ljud kommer samtidigt även med Bluetooth-fördröjning.
function exploded() {
  const delay = audio.explode();
  // Förvalt är förra rundans kategorier, så det räcker med ett tryck för att köra vidare.
  pendingCategories = [...game.roundCategories];
  freezing = true;
  document.body.classList.add('frozen');
  guardUntil = performance.now() + delay + EXPLOSION_GUARD_MS;
  setTimeout(() => {
    freezing = false;
    document.body.classList.remove('frozen');
    if (!game || game.phase !== 'exploded') return;
    vibrate([500, 100, 300, 100, 600]);
    flash('boom');
    document.body.classList.remove('shake');
    void document.body.offsetWidth;
    document.body.classList.add('shake');
    render();
    const btn = app.querySelector('.next');
    if (btn) {
      btn.disabled = true;
      setTimeout(() => (btn.disabled = false), EXPLOSION_GUARD_MS);
    }
  }, delay);
}

// Högst två: en tredje ersätter den som valdes först. Den sista går inte att välja bort.
function pickCategory(id) {
  if (pendingCategories.includes(id)) {
    if (pendingCategories.length > 1) pendingCategories = pendingCategories.filter((c) => c !== id);
  } else {
    pendingCategories = [...pendingCategories, id].slice(-RULES.maxRoundCategories);
  }
  app.querySelectorAll('.pick').forEach((b) => {
    const on = pendingCategories.includes(b.dataset.cat);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
}

function toggleSound() {
  audio.unlock();
  audio.setEnabled(!audio.enabled);
  app.querySelectorAll('.sound').forEach((b) => (b.outerHTML = soundToggle()));
}

function startMatch() {
  audio.unlock();
  audio.keepAlive();
  keepAwake();
  const players = setupPlayers.map((p) => ({ alias: p.alias.trim(), level: p.level }));
  if (mode === 'vote') {
    vote = new VoteGame({ players, countries, categories: setupCategories, questions: setupQuestions });
  } else {
    game = new Game({ players, countries, categories: setupCategories });
  }
  history.pushState({ game: true }, '');
  render();
}

function endMatch() {
  audio.endMatch();
  game = null;
  vote = null;
  voteChoice = null;
  voteMenu = false;
  freezing = false;
  document.body.classList.remove('frozen');
  render();
}

// Webbläsaren tillåter ljud först efter ett tryck. Lås upp vid första
// bästa tryck, så att menymusiken kan börja redan i lobbyn.
for (const type of ['touchend', 'click', 'keydown']) {
  document.addEventListener(type, () => audio.unlock(), { capture: true, passive: true });
}

// Bakåt-knappen/svepet ska inte avsluta matchen av misstag: pausa i stället.
// Från startskärmen går bakåt till lobbyn.
window.addEventListener('popstate', () => {
  if (game || vote) {
    history.pushState({ game: true }, '');
    if (game) game.pause();
    else voteMenu = true;
  } else if (mode) {
    mode = null;
  } else {
    return;
  }
  render();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (game) {
      game.pause();
      render(); // sparar också matchen
    }
    if (vote) saveMatch();
    audio.sleep();
  } else {
    audio.wake();
    keepAwake();
  }
});

// ---------- Spelloopen ----------

function loop() {
  requestAnimationFrame(loop);
  if (!game) return;
  const g = game;
  g.tick();

  update();
  if (!game) return;

  // Pulsen går när någon håller bomben, och står still vid paus och mellan rundor.
  const live = (g.phase === 'question' || g.phase === 'handover') && !g.paused;
  if (live) audio.setProgress(g.progress());
  audio.setPulse(live);
  // Under rundan ändras timern hela tiden: spara den regelbundet.
  if (live && performance.now() - savedAt > SAVE_INTERVAL_MS) saveMatch();
}

// Ritar om när spelets läge har ändrats. Bomben kan smälla både i loopen och
// mitt i ett tryck, så smällen hanteras här på ett ställe.
function update(force = false) {
  if (!game) {
    if (force) render();
    return;
  }
  const g = game;
  if (freezing) return;
  if (g.phase === 'exploded' && rendered.phase !== 'exploded') {
    exploded();
    return;
  }
  if (
    force ||
    rendered.screen !== 'game' ||
    rendered.phase !== g.phase ||
    rendered.current !== g.current ||
    rendered.holder !== g.holder ||
    rendered.paused !== !!g.paused
  ) {
    render();
  }
}

// ---------- Konfetti ----------

function startConfetti(canvas) {
  const c = canvas.getContext('2d');
  const colors = ['#ffd23f', '#3bceac', '#ee4266', '#5a8dee', '#ffffff'];
  const resize = () => {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
  };
  resize();
  const bits = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height,
    vy: (2 + Math.random() * 3) * devicePixelRatio,
    vx: (Math.random() - 0.5) * 2 * devicePixelRatio,
    r: Math.random() * Math.PI,
    s: (6 + Math.random() * 6) * devicePixelRatio,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const draw = () => {
    if (!canvas.isConnected) return;
    c.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of bits) {
      b.y += b.vy;
      b.x += b.vx;
      b.r += 0.1;
      if (b.y > canvas.height) b.y = -b.s;
      c.save();
      c.translate(b.x, b.y);
      c.rotate(b.r);
      c.fillStyle = b.color;
      c.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
      c.restore();
    }
    requestAnimationFrame(draw);
  };
  draw();
}

// ---------- Uppdateringar ----------

// En ny version installeras i bakgrunden av service workern. När den tar över
// laddas sidan om, men bara på startskärmen: en pågående match avbryts aldrig.
let updateReady = false;

function watchForUpdates() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      // En app på hemskärmen startas sällan om, bara tas fram igen. Leta efter
      // ny version varje gång den syns.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // första installationen, sidan är redan aktuell
    updateReady = true;
    reloadIfIdle();
  });
}

function reloadIfIdle() {
  if (updateReady && !game && !vote) location.reload();
}

// ---------- Start ----------

async function init() {
  watchForUpdates();
  try {
    countries = await (await fetch('data/countries.json')).json();
  } catch {
    app.innerHTML = '<p class="loading">Kunde inte ladda länderna. Ladda om sidan.</p>';
    return;
  }
  // Fortsätt en match som pågick när appen stängdes.
  game = loadMatch();
  vote = game ? null : loadVote();
  if (game) {
    mode = 'bomb';
    pendingCategories = [...game.roundCategories];
    history.pushState({ game: true }, '');
  } else if (vote) {
    mode = 'vote';
    history.pushState({ game: true }, '');
  }
  render();
  requestAnimationFrame(loop);
}

// Sista chansen att spara när sidan stängs.
window.addEventListener('pagehide', () => {
  if (game) game.pause();
  if (game || vote) saveMatch();
});

init();
