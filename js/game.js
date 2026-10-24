// Spelmotorn. Ren logik utan DOM, så att den går att testa i Node.
// Tiden kommer från clock() i millisekunder, så att testerna kan styra den.
import { LEVELS, difficultyForRound, maxRounds } from './questions.js';
import { CATEGORIES, Quiz } from './categories.js';
import { TurnOrder } from './order.js';
import { pick, randInt } from './random.js';

export const RULES = {
  lives: 3,
  // Första rundans timer slumpas mellan min och max. Varje följande runda
  // blir kortare (fuseDecay), men aldrig under fuseFloorMs.
  fuseMinMs: 120000,
  fuseMaxMs: 240000,
  fuseDecay: 0.85,
  fuseFloorMs: 30000,
  // I början tickar bomben lugnt i några varv innan tempot börjar öka: två
  // varv, eller ett när man är många. Det lugna läget slutar senast när halva
  // tiden har gått, så att det alltid hinner accelerera före smällen.
  calmLaps: 2,
  calmLapsMany: 1,
  manyPlayers: 5,
  calmMaxShare: 0.5,
  // Den som sprängs väljer kategorier för nästa runda, högst så här många.
  maxRoundCategories: 2,
  wrongPenaltyMs: 3000,
  lockMs: 1000,
  frikortChance: 0.1,
};

// Faser:
//   intro     väntar på att den som startar rundan trycker "Starta"
//   question  någon håller mobilen och svarar (eller har fått ett frikort)
//   handover  rätt svar, mobilen är på väg till nästa spelare
//   exploded  bomben har smällt
//   over      en spelare är kvar
export class Game {
  constructor({
    players,
    countries,
    categories = ['flaggor'],
    rng = Math.random,
    clock = () => Date.now(),
    rules = RULES,
  }) {
    this.rng = rng;
    this.clock = clock;
    this.rules = rules;
    this.questions = new Quiz(countries, rng);
    // Kategorierna som kryssades i för matchen. Rundans kategorier väljs bland dem.
    this.categories = categories.filter((c) => c in CATEGORIES);
    if (this.categories.length === 0) this.categories = ['flaggor'];
    this.order = new TurnOrder(rng);
    this.players = players.map((p, i) => ({ id: i, alias: p.alias, level: p.level, lives: rules.lives }));
    this.questionCount = 0;
    this.newMatch();
  }

  newMatch() {
    for (const p of this.players) p.lives = this.rules.lives;
    this.phase = 'intro';
    this.holder = pick(this.rng, this.alive()).id;
    this.round = 0;
    this.roundCategories = [...this.categories];
    this.chooser = null;
    this.explosion = null;
    this.winner = null;
    this.current = null;
    this.paused = null;
  }

  alive() {
    return this.players.filter((p) => p.lives > 0);
  }

  player(id = this.holder) {
    return this.players[id];
  }

  now() {
    return this.paused ? this.paused.at : this.clock();
  }

  startRound() {
    if (this.phase !== 'intro') return;
    this.round++;
    this.fuseMs = this.fuseFor(this.round);
    this.startedAt = this.clock();
    this.deadline = this.startedAt + this.fuseMs;
    this.calmEndedAt = null;
    this.order.reset(this.alive().map((p) => p.id), this.holder);
    this.lockedUntil = 0;
    this.serve();
  }

  // Rundans timer: slumpad, och kortare för varje runda.
  fuseFor(round) {
    const base = randInt(this.rng, this.rules.fuseMinMs, this.rules.fuseMaxMs);
    return Math.max(this.rules.fuseFloorMs, Math.round(base * this.rules.fuseDecay ** (round - 1)));
  }

  calmLaps() {
    return this.players.length >= this.rules.manyPlayers ? this.rules.calmLapsMany : this.rules.calmLaps;
  }

  serve() {
    this.phase = 'question';
    const wasCard = this.current?.type === 'frikort';
    if (!wasCard && this.questionCount > 0 && this.rng() < this.rules.frikortChance) {
      this.current = { type: 'frikort' };
      return;
    }
    this.questionCount++;
    const level = this.player().level;
    const category = pick(this.rng, this.roundCategories);
    const question = this.questions.next({ category, options: LEVELS[level].options, difficulty: this.difficulty() });
    this.current = { type: 'fraga', level, ...question };
  }

  // Svårighetstrappan: första rundan är lättast, och sista möjliga rundan svårast.
  difficulty() {
    return difficultyForRound(this.round, maxRounds(this.players.length, this.rules.lives));
  }

  isLocked() {
    return this.now() < this.lockedUntil;
  }

  // Returnerar 'correct', 'wrong' eller null om svaret inte räknas.
  answer(index) {
    if (this.paused || this.phase !== 'question') return null;
    if (this.tick()) return null;
    if (this.current.type !== 'fraga' || this.isLocked()) return null;
    if (index === this.current.correctIndex) {
      this.passOn();
      return 'correct';
    }
    this.deadline -= this.rules.wrongPenaltyMs;
    this.lockedUntil = this.now() + this.rules.lockMs;
    this.wrongPending = true;
    this.tick();
    return 'wrong';
  }

  useFrikort() {
    if (this.paused || this.phase !== 'question' || this.current.type !== 'frikort') return false;
    if (this.tick()) return false;
    this.passOn();
    return true;
  }

  passOn() {
    // Turen flyttas direkt: smäller det under överlämningen är det mottagaren som förlorar.
    this.holder = this.order.next(this.alive().map((p) => p.id), this.holder);
    this.updateCalm();
    this.phase = 'handover';
    this.current = null;
  }

  ready() {
    if (this.paused || this.phase !== 'handover') return;
    if (this.tick()) return;
    this.serve();
  }

  remainingMs() {
    return this.deadline - this.now();
  }

  isCalm() {
    return this.calmEndedAt === null;
  }

  updateCalm() {
    if (!this.isCalm()) return;
    const latest = this.startedAt + this.fuseMs * this.rules.calmMaxShare;
    if (this.order.laps >= this.calmLaps() || this.now() >= latest) {
      this.calmEndedAt = Math.min(this.now(), latest);
    }
  }

  // Hur långt det har gått mot smällen efter det lugna läget, 0–1. Styr
  // pulsens tempo: 0 hela det lugna läget, sedan jämnt upp till 1 vid smällen.
  // Ett fel svar flyttar smällen närmare, så värdet hoppar framåt.
  progress() {
    if (this.phase !== 'question' && this.phase !== 'handover') return 0;
    if (this.isCalm()) return 0;
    const span = this.deadline - this.calmEndedAt;
    if (span <= 0) return 1;
    return Math.min(1, Math.max(0, (this.now() - this.calmEndedAt) / span));
  }

  // Anropas ofta av gränssnittet. Returnerar true om bomben smällde nu.
  tick() {
    if (this.paused) return false;
    if (this.phase !== 'question' && this.phase !== 'handover') return false;
    if (this.remainingMs() <= 0) {
      this.explode();
      return true;
    }
    this.updateCalm();
    if (this.wrongPending && !this.isLocked()) {
      this.wrongPending = false;
      this.serve();
    }
    return false;
  }

  explode() {
    const loser = this.player();
    loser.lives--;
    this.explosion = {
      loser: loser.id,
      out: loser.lives === 0,
      duringHandover: this.phase === 'handover',
      question: this.current?.type === 'fraga' ? this.current : null,
    };
    this.wrongPending = false;
    this.current = null;
    this.phase = 'exploded';
    const alive = this.alive();
    if (alive.length === 1) this.winner = alive[0].id;
    // Den som förlorade livet startar nästa runda och väljer kategorier.
    // Är den ute lottas någon annan.
    this.chooser = loser.lives > 0 ? loser.id : pick(this.rng, alive).id;
  }

  // categories: det den som sprängdes valde för nästa runda (valfritt).
  nextRound(categories = null) {
    if (this.phase !== 'exploded') return;
    if (this.winner !== null) {
      this.phase = 'over';
      return;
    }
    if (categories) this.chooseCategories(categories);
    this.holder = this.chooser;
    this.explosion = null;
    this.phase = 'intro';
  }

  // Kategorierna för nästa runda, valda av den som startar den. Bara matchens
  // kategorier räknas, och högst maxRoundCategories.
  chooseCategories(categories) {
    if (this.phase !== 'intro' && this.phase !== 'exploded') return;
    const valid = [...new Set(categories)].filter((c) => this.categories.includes(c));
    if (valid.length > 0) this.roundCategories = valid.slice(0, this.rules.maxRoundCategories);
  }

  pause() {
    if (this.paused || (this.phase !== 'question' && this.phase !== 'handover')) return;
    this.paused = { at: this.clock() };
  }

  resume() {
    if (!this.paused) return;
    const pausedFor = this.clock() - this.paused.at;
    this.deadline += pausedFor;
    this.lockedUntil += pausedFor;
    this.startedAt += pausedFor;
    if (this.calmEndedAt !== null) this.calmEndedAt += pausedFor;
    this.paused = null;
  }
}
