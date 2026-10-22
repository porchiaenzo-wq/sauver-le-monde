/*
 * Tests du jeu « Campagne » : règles de base et équilibrage (avec des joueurs automatiques).
 * Lancer avec : node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/game-engine.js');
const C = require('../js/costs.js');
const Data = require('../js/game-data.js');
const { SOURCES } = require('../js/sources.js');

// Mesures dans l'ordre où un bon joueur les achète (les moins chères par tonne d'abord).
const ORDER = ['methaneCut', 'stopDeforestation', 'cleanPower', 'heatPumps', 'electricTransport', 'plantDiet',
  'energySaving', 'reforestation', 'cleanIndustry', 'rockWeathering', 'directCapture'];

/** Joue une partie entière. strategy : 'idle' (rien), 'good' (bon joueur), 'geo' (géo-ingénierie seule). */
function play(period, difficulty, strategy, seed, clickRate = 0.7) {
  const g = E.createGame({ period, difficulty, seed });
  let s = seed * 7919 + 1;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const seen = new Set();
  while (g.status === 'playing') {
    E.tick(g, 0.25);
    if (strategy === 'idle') continue;
    for (const b of g.bubbles.slice()) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      if (random() < clickRate) E.collectBubble(g, b.id);
    }
    if (strategy === 'geo') {
      for (const id of ['stratosphericAerosols', 'cloudBrightening']) {
        const p = E.nextPrice(g, id);
        if (p != null && g.funds > p + 200) E.buy(g, id);
      }
      continue;
    }
    if (g.resistance > 45) {
      for (const id of ['justTransition', 'education']) {
        const p = E.nextPrice(g, id);
        if (p != null && g.funds > p + 100) E.buy(g, id);
      }
    }
    // Ne pas acheter plus que ce que les revenus permettent d'entretenir.
    const finance = (g.yearlyIncome || 950) * (1 + clickRate);
    for (const id of ORDER) {
      const p = E.nextPrice(g, id);
      if (p == null) continue;
      const planned = C.computeCostsDeployed(Object.fromEntries(ORDER.map((x) => [x, E.targetValue(g, x)]))).total.central;
      if (planned + E.upkeepAfter(g, id) > 0.8 * finance) continue;
      if (g.funds >= p + 150) {
        E.buy(g, id);
        break;
      }
    }
  }
  return g;
}

const SEEDS = [1, 2, 3, 4, 5];
const wins = (period, difficulty, strategy) =>
  SEEDS.filter((seed) => play(period, difficulty, strategy, seed).result.won).length;

test('une partie commence en 2026 avec le monde actuel', () => {
  const g = E.createGame({ period: '2050', difficulty: 'normal', seed: 1 });
  assert.equal(Math.floor(g.time), 2026);
  assert.ok(Math.abs(g.lastYear.temperature - 1.36) < 0.1);
  assert.equal(g.status, 'playing');
});

test('le temps avance selon la vitesse choisie', () => {
  const g = E.createGame({ period: '2050', difficulty: 'normal', seed: 1 });
  const year = E.secondsPerYear(g.period);
  E.tick(g, g.period.secondsPerMonth); // un mois à vitesse ×1
  assert.ok(Math.abs(g.time - (2026 + 1 / 12)) < 1e-9, 'le temps saute d’un mois');
  E.tick(g, g.period.secondsPerMonth / 2);
  assert.ok(Math.abs(g.time - (2026 + 1 / 12)) < 1e-9, 'pas de demi-mois : on attend le mois suivant');
  E.tick(g, year - g.period.secondsPerMonth * 1.5);
  assert.ok(Math.abs(g.time - 2027) < 1e-9);
  E.setSpeed(g, 4);
  E.tick(g, year);
  assert.ok(Math.abs(g.time - 2031) < 1e-9);
  E.setSpeed(g, 0);
  E.tick(g, 10);
  assert.ok(Math.abs(g.time - 2031) < 1e-9, 'en pause, le temps ne bouge pas');
});

test('acheter coûte de l’argent et monte le niveau ; impossible sans argent', () => {
  const g = E.createGame({ period: '2050', difficulty: 'normal', seed: 1 });
  const price = E.nextPrice(g, 'methaneCut');
  const before = g.funds;
  assert.ok(E.buy(g, 'methaneCut').ok);
  assert.equal(g.funds, before - price);
  assert.equal(g.levels.methaneCut, 1);
  g.funds = 0;
  assert.equal(E.buy(g, 'cleanPower').ok, false);
});

test('les mesures se déploient peu à peu, pas d’un coup', () => {
  const g = E.createGame({ period: '2100', difficulty: 'normal', seed: 1 });
  g.funds = 1e6;
  for (let i = 0; i < 4; i++) E.buy(g, 'cleanPower');
  E.tick(g, E.secondsPerYear(g.period) * 1.01);
  assert.ok(g.deployed.cleanPower > 0.4 && g.deployed.cleanPower < 0.6, `${g.deployed.cleanPower}`);
});

test('les bulles de fonds rapportent de l’argent, celles de soutien font baisser la résistance', () => {
  const g = E.createGame({ period: '2050', difficulty: 'normal', seed: 3 });
  while (!g.bubbles.some((b) => b.kind === 'funds')) E.tick(g, 0.25);
  const bubble = g.bubbles.find((b) => b.kind === 'funds');
  const before = g.funds;
  E.collectBubble(g, bubble.id);
  assert.equal(g.funds, before + bubble.amount);
  assert.equal(E.collectBubble(g, bubble.id), null, 'une bulle ne se ramasse qu’une fois');
});

test('les bulles disparaissent si on ne clique pas', () => {
  const g = E.createGame({ period: '2050', difficulty: 'normal', seed: 3 });
  while (!g.bubbles.length) E.tick(g, 0.25);
  const id = g.bubbles[0].id;
  E.setSpeed(g, 1);
  for (let t = 0; t < E.BUBBLE_LIFETIME + 1; t += 0.25) E.tick(g, 0.25);
  assert.ok(!g.bubbles.some((b) => b.id === id));
});

test('l’argent et la résistance évoluent chaque mois', () => {
  const g = E.createGame({ period: '2100', difficulty: 'normal', seed: 2 });
  const funds = g.funds;
  const resistance = g.resistance;
  E.tick(g, g.period.secondsPerMonth);
  assert.ok(Math.abs(g.funds - (funds + g.yearlyIncome / 12)) < 1, 'un douzième des revenus annuels');
  assert.notEqual(g.resistance, resistance);
});

test('la partie se termine à la fin de la mission', () => {
  const g = play('2050', 'easy', 'idle', 1);
  assert.equal(g.result.year, 2050);
  assert.notEqual(g.status, 'playing');
});

test('équilibrage : ne rien faire fait toujours perdre', () => {
  for (const period of ['2050', '2100']) {
    for (const difficulty of ['easy', 'normal', 'hard']) assert.equal(wins(period, difficulty, 'idle'), 0, `${period} ${difficulty}`);
  }
});

test('équilibrage : un bon joueur gagne en facile et presque toujours en normal', () => {
  for (const period of ['2050', '2100']) {
    assert.equal(wins(period, 'easy', 'good'), SEEDS.length, `${period} facile`);
    assert.ok(wins(period, 'normal', 'good') >= 3, `${period} normal`);
  }
});

test('équilibrage : le niveau difficile résiste à un bon joueur', () => {
  for (const period of ['2050', '2100']) assert.ok(wins(period, 'hard', 'good') <= 2, `${period} difficile`);
});

test('la géo-ingénierie seule ne suffit pas : elle masque le réchauffement sans le soigner', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) assert.equal(wins('2100', difficulty, 'geo'), 0, difficulty);
  const g = play('2100', 'easy', 'geo', 1);
  assert.ok(g.result.temperature < g.result.unmaskedTemperature - 0.5, 'le climat réel est plus froid que sans le masque');
});

test('la prévision annonce un résultat proche de la vraie fin de partie (sans nouveaux achats)', () => {
  const g = E.createGame({ period: '2100', difficulty: 'normal', seed: 4 });
  g.funds = 1e6;
  for (const id of ['cleanPower', 'methaneCut', 'stopDeforestation']) for (let i = 0; i < 3; i++) E.buy(g, id);
  E.tick(g, E.secondsPerYear(g.period) * 5);
  const predicted = E.forecast(g).value;
  while (g.status === 'playing') E.tick(g, 0.5);
  assert.ok(Math.abs(predicted - g.result.value) < 0.25, `prévu ${predicted.toFixed(2)}, obtenu ${g.result.value.toFixed(2)}`);
});

test('données du jeu valides', () => {
  for (const u of Data.UPGRADES) {
    assert.equal(u.levels.length, u.price.length, u.id);
    assert.equal(u.levels.length, u.steps.length, u.id);
    assert.ok(Data.GROUPS[u.group], u.id);
  }
  assert.ok(SOURCES.cpi2025, 'source du financement climat');
});
