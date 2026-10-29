// Hemlig omröstning: mobilen går runt och alla svarar i hemlighet på samma
// fråga, sedan visas allas svar samtidigt. Var och en satsar 1–3 poäng på hur
// säker den är: rätt ger insatsen, fel drar av den.
// Ren logik utan DOM, så att den går att testa i Node.
import { LEVELS, MIN_STEPS, difficultyForRound } from './questions.js';
import { CATEGORIES, Quiz } from './categories.js';
import { pick, randInt, shuffle } from './random.js';

// Ändras om snapshot() får ett nytt format, så att gamla sparningar ignoreras.
const SNAPSHOT_VERSION = 1;

export const VOTE_RULES = {
  questions: 10,
  minBet: 1,
  maxBet: 3,
};

// Antal frågor man kan välja på startskärmen.
export const QUESTION_COUNTS = [5, 10, 15];

// Faser:
//   handover  mobilen ska till den som står på tur att svara
//   answer    den som har mobilen svarar och satsar i hemlighet
//   ready     alla har svarat, mobilen läggs i mitten
//   reveal    allas svar visas samtidigt
//   over      alla frågor är klara
export class VoteGame {
  constructor({
    players,
    countries,
    categories = ['flaggor'],
    questions = VOTE_RULES.questions,
    rng = Math.random,
    rules = VOTE_RULES,
  }) {
    this.rng = rng;
    this.rules = rules;
    this.questions = new Quiz(countries, rng);
    this.categories = categories.filter((c) => c in CATEGORIES);
    if (this.categories.length === 0) this.categories = ['flaggor'];
    this.total = Math.max(1, Math.round(questions) || rules.questions);
    this.players = players.map((p, i) => ({ id: i, alias: p.alias, level: p.level, score: 0 }));
    this.newMatch();
  }

  newMatch() {
    for (const p of this.players) p.score = 0;
    this.number = 0;
    // Vem som svarar först byts varje fråga, med start hos en slumpad spelare.
    this.first = randInt(this.rng, 0, this.players.length - 1);
    this.results = null;
    this.nextQuestion();
  }

  nextQuestion() {
    this.number++;
    const levels = this.players.map((p) => LEVELS[p.level]);
    // Frågan görs med så många alternativ som den högsta nivån behöver, och var
    // och en ser sedan sin nivås antal. Barn gör frågorna lite lättare för alla.
    const options = Math.max(...levels.map((l) => l.options));
    const scale = levels.reduce((sum, l) => sum + l.difficulty, 0) / levels.length;
    const q = this.questions.next({
      category: pick(this.rng, this.categories),
      options,
      difficulty: this.difficulty() * scale,
    });
    this.question = q;
    this.views = levels.map((l) => optionsFor(this.rng, q, l.options));
    const n = this.players.length;
    const start = (this.first + this.number - 1) % n;
    this.order = Array.from({ length: n }, (_, i) => (start + i) % n);
    this.turn = 0;
    this.answers = this.players.map(() => null);
    this.results = null;
    this.phase = 'handover';
  }

  // Svårighetstrappan går från första till sista frågan, med minst MIN_STEPS
  // steg så att en kort match inte blir för svår.
  difficulty() {
    return difficultyForRound(this.number, Math.max(MIN_STEPS, this.total));
  }

  voter() {
    return this.players[this.order[this.turn]];
  }

  // Alternativen (index i question.options) som spelaren får se.
  view(id = this.voter().id) {
    return this.views[id];
  }

  answered() {
    return this.answers.filter(Boolean).length;
  }

  // Den som har fått mobilen visar frågan.
  show() {
    if (this.phase === 'handover') this.phase = 'answer';
  }

  // choice är ett index i question.options. Returnerar true om svaret togs emot.
  vote(choice, bet) {
    if (this.phase !== 'answer') return false;
    const id = this.voter().id;
    if (!this.view(id).includes(choice)) return false;
    if (!Number.isInteger(bet) || bet < this.rules.minBet || bet > this.rules.maxBet) return false;
    this.answers[id] = { choice, bet };
    this.turn++;
    this.phase = this.turn < this.order.length ? 'handover' : 'ready';
    return true;
  }

  // Alla svar visas: rätt ger insatsen, fel drar av den.
  reveal() {
    if (this.phase !== 'ready') return;
    this.results = this.players.map((p) => {
      const a = this.answers[p.id];
      const correct = a.choice === this.question.correctIndex;
      const points = correct ? a.bet : -a.bet;
      p.score += points;
      return { id: p.id, ...a, correct, points };
    });
    this.phase = 'reveal';
  }

  next() {
    if (this.phase !== 'reveal') return;
    if (this.number >= this.total) this.phase = 'over';
    else this.nextQuestion();
  }

  // Spelarna med flest poäng. Blir det lika delar de på segern.
  winners() {
    const best = Math.max(...this.players.map((p) => p.score));
    return this.players.filter((p) => p.score === best);
  }

  standings() {
    return [...this.players].sort((a, b) => b.score - a.score || a.id - b.id);
  }

  // Ögonblicksbild som går att spara som JSON. Länderna i frågan sparas bara
  // med id och namn, det är allt gränssnittet behöver.
  snapshot() {
    return {
      v: SNAPSHOT_VERSION,
      players: this.players.map(({ alias, level, score }) => ({ alias, level, score })),
      categories: this.categories,
      total: this.total,
      number: this.number,
      first: this.first,
      phase: this.phase,
      question: JSON.parse(JSON.stringify(this.question, (key, value) =>
        value && typeof value === 'object' && 'farg' in value ? { id: value.id, namn: value.namn } : value,
      )),
      views: this.views,
      order: this.order,
      turn: this.turn,
      answers: this.answers,
      results: this.results,
    };
  }

  // Återskapar en match från snapshot(). Returnerar null om den inte går att använda.
  static restore(snap, { countries, rng = Math.random, rules = VOTE_RULES }) {
    if (!snap || snap.v !== SNAPSHOT_VERSION || !Array.isArray(snap.players) || snap.players.length < 2) return null;
    if (!['handover', 'answer', 'ready', 'reveal', 'over'].includes(snap.phase)) return null;
    const v = new VoteGame({ players: snap.players, countries, categories: snap.categories, questions: snap.total, rng, rules });
    const n = v.players.length;
    if (snap.order?.length !== n || snap.answers?.length !== n || snap.views?.length !== n) return null;
    if (snap.phase === 'reveal' && snap.results?.length !== n) return null;
    snap.players.forEach((p, i) => (v.players[i].score = Number(p.score) || 0));
    v.number = snap.number;
    v.first = snap.first;
    v.phase = snap.phase;
    v.question = snap.question;
    v.views = snap.views;
    v.order = snap.order;
    v.turn = snap.turn;
    v.answers = snap.answers;
    v.results = snap.results;
    // Ett halvfärdigt svar visas inte igen för någon annan: mobilen skickas till den som stod på tur.
    if (v.phase === 'answer') v.phase = 'handover';
    return v;
  }
}

// Rätt svar och så många felsvar som spelarens nivå ger, i frågans ordning.
export function optionsFor(rng, q, count) {
  const others = q.options.map((_, i) => i).filter((i) => i !== q.correctIndex);
  return [q.correctIndex, ...shuffle(rng, others).slice(0, count - 1)].sort((a, b) => a - b);
}
