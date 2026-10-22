/*
 * Tests du calcul des coûts.
 * Lancer avec : node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');
const C = require('../js/costs.js');
const { LEVER_GROUPS, PRESETS } = require('../js/levers.js');
const { SOURCES } = require('../js/sources.js');

const preset = (id) => PRESETS.find((p) => p.id === id).levers;

test('rien faire ne coûte rien', () => {
  const r = C.computeCosts({}, 2050);
  assert.equal(r.items.length, 0);
  assert.equal(r.total.central, 0);
});

test('chaque levier de mesure a un coût, avec des sources connues', () => {
  for (const lever of LEVER_GROUPS.flatMap((g) => g.levers)) {
    if (lever.id === 'geoStartYear') continue;
    const c = C.COSTS[lever.id];
    assert.ok(c, `pas de coût pour ${lever.id}`);
    assert.ok(c.low <= c.central && c.central <= c.high, `fourchette incohérente : ${lever.id}`);
    for (const s of c.sources) assert.ok(SOURCES[s], `source inconnue : ${s}`);
  }
});

test("les tonnes évitées par mesure s'additionnent à la baisse totale", () => {
  const levers = { ...M.DEFAULT_LEVERS, ...preset('paris') };
  const r = C.computeCosts(levers, 2050);
  const avoided = r.items.reduce((s, i) => s + i.tonnes, 0);
  const before = M.futureEmissions(M.DEFAULT_LEVERS, 2050);
  const after = M.futureEmissions(levers, 2050);
  const gwp = 0.36 * 29.8;
  const expected = before.fossil + before.landUse - before.removals + before.methane * gwp
    - (after.fossil + after.landUse - after.removals + after.methane * gwp);
  assert.ok(Math.abs(avoided - expected) < 1e-6);
});

test("l'accord de Paris coûte de l'ordre de ce qu'annonce le GIEC (1,3 à 2,7 % du PIB en 2050)", () => {
  const share = C.computeCosts(preset('paris'), 2050).gdpShare;
  assert.ok(share > 0.005 && share < 0.04, `${(share * 100).toFixed(2)} %`);
});

test('le total est la somme des mesures', () => {
  const r = C.computeCosts(preset('everything'), 2050);
  const sum = r.items.reduce((s, i) => s + i.central, 0);
  assert.ok(Math.abs(sum - r.total.central) < 1e-6);
  assert.ok(r.total.low <= r.total.central && r.total.central <= r.total.high);
});

test('la géo-ingénierie coûte peu, et rien avant son démarrage ou après son arrêt', () => {
  const on = C.computeCosts({ stratosphericAerosols: 2, geoStartYear: 2035 }, 2050);
  assert.ok(on.total.central > 0 && on.total.central < 100);
  assert.equal(C.computeCosts({ stratosphericAerosols: 2, geoStartYear: 2060 }, 2050).total.central, 0);
  assert.equal(C.computeCosts({ stratosphericAerosols: 2, geoStopYear: 2040 }, 2050).total.central, 0);
});

test('la sobriété fait économiser, les aspirateurs à CO2 coûtent cher', () => {
  const saving = C.computeCosts({ energySaving: 0.3 }, 2050).total.central;
  const dac = C.computeCosts({ directCapture: 10 }, 2050).total.central;
  assert.ok(saving < 0);
  assert.ok(dac > 1000);
});
