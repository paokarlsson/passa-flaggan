// Gränssnittet: ritar skärmarna utifrån spelmotorns fas och styr ljudet.
import { Game } from './game.js';
import { LEVELS, levelForAge } from './questions.js';
import { AudioEngine, vibrate } from './audio.js';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const STORAGE_KEY = 'passa-flaggan:spelare';
// Spärr mot att någon i farten råkar trycka på nästa skärms knapp.
const HANDOVER_GUARD_MS = 500;
const EXPLOSION_GUARD_MS = 1500;

const app = document.getElementById('app');
const flashEl = document.getElementById('flash');

let countries = [];
let game = null;
let setupPlayers = loadPlayers();
let rendered = null; // vad som senast ritades, för att veta när skärmen behöver ritas om
let freezing = false; // pausen mellan att bomben smäller och att smällen visas
let guardUntil = 0;
let wakeLock = null;

const audio = new AudioEngine();
// Mobilen vibrerar i takt med pulsen, starkare mot slutet.
audio.onBeat = (p) => {
  if (p > 0.3) vibrate(Math.round(10 + 50 * p));
};

// ---------- Hjälpare ----------

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const flagImg = (c, cls = 'flag') => `<img class="${cls}" src="flaggor/${c.id}.svg" alt="Flagga" draggable="false">`;

const hearts = (lives) =>
  lives > 0 ? '❤️'.repeat(lives) : '💀';

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

function renderSetup() {
  const canStart =
    setupPlayers.length >= MIN_PLAYERS && setupPlayers.every((p) => p.alias.trim().length > 0);
  app.innerHTML = `
    <section class="screen setup">
      <header class="logo">
        <div class="logo-bomb">💣</div>
        <h1>Passa flaggan</h1>
        <p class="tagline">Gissa flaggan och skicka bomben vidare innan den smäller!</p>
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
            ${setupPlayers.length > MIN_PLAYERS ? `<button type="button" class="remove" aria-label="Ta bort">✕</button>` : ''}
          </li>`,
          )
          .join('')}
      </ol>
      ${setupPlayers.length < MAX_PLAYERS ? `<button type="button" class="btn ghost add">+ Lägg till spelare</button>` : ''}
      <button type="button" class="btn big start" ${canStart ? '' : 'disabled'}>Starta match</button>
      ${soundToggle()}
      <details class="rules">
        <summary>Så spelar man</summary>
        <ul>
          <li>Alla börjar med 3 liv. Bomben har en dold timer på 20–60 sekunder.</li>
          <li>Svara rätt så blinkar skärmen grönt. Skicka mobilen till den vars namn visas.</li>
          <li>Fel svar ger 1 sekunds spärr och drar 3 sekunder från bomben.</li>
          <li>Ibland får man ett frikort och kan skicka vidare direkt.</li>
          <li>Den som håller mobilen när det smäller förlorar ett liv. Sist kvar vinner!</li>
          <li>Nivå: Barn har 3 alternativ och kända flaggor, Normal 4 alternativ och alla FN-länder, Nörd 6 alternativ med förväxlingsbara flaggor.</li>
          <li>Slå på ljudet (och stäng av ljudlöst läge på iPhone) för full effekt.</li>
        </ul>
      </details>
      <details class="credits">
        <summary>Källor och licenser</summary>
        <p>Flaggor: <a href="https://github.com/lipis/flag-icons">lipis/flag-icons</a> (MIT).
        Landsdata: <a href="https://github.com/mledoze/countries">mledoze/countries</a> (ODbL).</p>
      </details>
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
        <p class="kicker">Runda ${g.round + 1}</p>
        <div class="bomb-idle">💣</div>
        <p class="lead"><strong class="name">${esc(holder.alias)}</strong> börjar</p>
        <p class="hint">Sätt er i en ring. Tryck när alla är redo.</p>
        <button type="button" class="btn big go">Tänd stubinen 🔥</button>
        ${livesList()}
      </section>`;
  } else if (g.phase === 'handover') {
    html = `
      <section class="screen center handover">
        <p class="kicker">Skicka till</p>
        <p class="giant name">${esc(holder.alias)}</p>
        <button type="button" class="btn big ready">Jag är ${esc(holder.alias)}, visa frågan!</button>
      </section>`;
  } else if (g.phase === 'question' && g.current.type === 'frikort') {
    html = `
      <section class="screen center frikort">
        ${topBar()}
        <div class="card">
          <div class="card-icon">🎟️</div>
          <p class="card-title">Frikort!</p>
          <p class="hint">Du slipper svara. Skicka bomben vidare direkt.</p>
        </div>
        <button type="button" class="btn big use-card">Skicka vidare!</button>
      </section>`;
  } else if (g.phase === 'question') {
    const q = g.current;
    const n = q.options.length;
    if (q.kind === 'flagga') {
      html = `
        <section class="screen question">
          ${topBar()}
          <div class="prompt">${flagImg(q.answer, 'flag hero')}</div>
          <div class="answers names n${n}">
            ${q.options.map((o, i) => `<button type="button" class="answer" data-i="${i}">${esc(o.namn)}</button>`).join('')}
          </div>
        </section>`;
    } else {
      html = `
        <section class="screen question">
          ${topBar()}
          <div class="prompt text">
            <p class="kicker">Vilken flagga har</p>
            <p class="country">${esc(q.answer.namn)}?</p>
          </div>
          <div class="answers flags n${n}">
            ${q.options.map((o, i) => `<button type="button" class="answer" data-i="${i}" aria-label="Alternativ ${i + 1}">${flagImg(o)}</button>`).join('')}
          </div>
        </section>`;
    }
  } else if (g.phase === 'exploded') {
    const e = g.explosion;
    const loser = g.player(e.loser);
    const q = e.question;
    let reveal = '';
    if (e.duringHandover) {
      reveal = `<p class="hint">Bomben small medan mobilen skickades!</p>`;
    } else if (q) {
      reveal = `
        <div class="reveal">
          ${flagImg(q.answer)}
          <p>${q.kind === 'flagga' ? 'Flaggan var' : 'Rätt flagga för'} <strong>${esc(q.answer.namn)}</strong></p>
        </div>`;
    }
    const button =
      g.winner !== null
        ? `<button type="button" class="btn big next">Se vinnaren 🏆</button>`
        : `<button type="button" class="btn big next">${e.out ? 'Starta nästa runda' : `${esc(loser.alias)}: starta nästa runda`}</button>`;
    html = `
      <section class="screen center exploded">
        <p class="boom">PANG!</p>
        <p class="lead"><strong class="name">${esc(loser.alias)}</strong> ${e.out ? 'är ute!' : 'förlorade ett liv'}</p>
        ${reveal}
        ${livesList(e.loser)}
        ${button}
      </section>`;
  } else if (g.phase === 'over') {
    const w = g.player(g.winner);
    html = `
      <section class="screen center over">
        <canvas class="confetti"></canvas>
        <p class="kicker">Vinnare</p>
        <div class="trophy">🏆</div>
        <p class="giant name">${esc(w.alias)}</p>
        <button type="button" class="btn big rematch">Revansch</button>
        <button type="button" class="btn ghost edit">Ändra spelare</button>
      </section>`;
  }

  if (g.paused) {
    html += `
      <div class="overlay">
        <div class="dialog">
          <p class="lead">Pausat</p>
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

function soundToggle() {
  return `<button type="button" class="btn ghost sound" aria-pressed="${audio.enabled}">
    ${audio.enabled ? '🔊 Ljud på' : '🔇 Ljud av'}</button>`;
}

function topBar() {
  const p = game.player();
  return `
    <header class="topbar">
      <span class="holder">💣 ${esc(p.alias)}</span>
      <span class="lives">${hearts(p.lives)}</span>
      <button type="button" class="pause" aria-label="Pausa">⏸</button>
    </header>`;
}

function livesList(highlight = null) {
  return `
    <ul class="lives-list">
      ${game.players
        .map(
          (p) => `<li class="${p.lives === 0 ? 'out' : ''} ${p.id === highlight ? 'hit' : ''}">
            <span>${esc(p.alias)}</span><span>${hearts(p.lives)}</span></li>`,
        )
        .join('')}
    </ul>`;
}

function render() {
  if (game) renderGame();
  else renderSetup();
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

  if (!game) {
    const row = t.closest('.player-row');
    if (t.classList.contains('level')) {
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
    }
    savePlayers();
    renderSetup();
    return;
  }

  audio.unlock();
  if (performance.now() < guardUntil) return;
  const g = game;

  if (t.classList.contains('sound')) {
    toggleSound();
    return;
  } else if (t.classList.contains('pause')) {
    g.pause();
  } else if (t.classList.contains('resume')) {
    g.resume();
  } else if (t.classList.contains('quit')) {
    endMatch();
  } else if (t.classList.contains('go')) {
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
    if (g.phase === 'over') {
      audio.win();
      vibrate([100, 50, 100, 50, 300]);
    }
  } else if (t.classList.contains('rematch')) {
    g.newMatch();
  } else if (t.classList.contains('edit')) {
    endMatch();
    return;
  }
  update(true);
});

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
  game = new Game({ players, countries });
  history.pushState({ game: true }, '');
  render();
}

function endMatch() {
  audio.endMatch();
  game = null;
  freezing = false;
  document.body.classList.remove('frozen');
  render();
}

// Bakåt-knappen/svepet ska inte avsluta matchen av misstag: pausa i stället.
window.addEventListener('popstate', () => {
  if (!game) return;
  history.pushState({ game: true }, '');
  game.pause();
  render();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (game) {
      game.pause();
      render();
    }
  } else {
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

// ---------- Start ----------

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  try {
    countries = await (await fetch('data/countries.json')).json();
  } catch {
    app.innerHTML = '<p class="loading">Kunde inte ladda länderna. Ladda om sidan.</p>';
    return;
  }
  render();
  requestAnimationFrame(loop);
}

init();
