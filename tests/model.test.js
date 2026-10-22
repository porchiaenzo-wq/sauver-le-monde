/*
 * Tests du modèle climatique : on vérifie qu'il retrouve les observations
 * et que chaque levier agit dans le bon sens.
 * Lancer avec : node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');
const { LEVER_GROUPS, GLOBAL_LEVERS, PRESETS } = require('../js/levers.js');
const { SOURCES } = require('../js/sources.js');

const at = (result, year) => result.years.find((y) => y.year === year);
const baseline = M.simulate({});

test('le passé correspond aux mesures', () => {
  // CO2 mesuré : 338,7 ppm en 1980, 369,7 en 2000, ≈ 425,7 en 2025 (NOAA, Global Carbon Budget)
  assert.ok(Math.abs(at(baseline, 2025).co2 - 425.7) < 1.5, 'CO2 en 2025');
  assert.ok(Math.abs(at(baseline, 2000).co2 - 369.7) < 5, 'CO2 en 2000');
  assert.ok(Math.abs(at(baseline, 1980).co2 - 338.7) < 5, 'CO2 en 1980');
  // Réchauffement dû à l'homme : ≈ 1,36 °C en 2024 (Forster et al. 2025), ≈ 1,07 °C sur 2010-2019 (GIEC)
  assert.ok(Math.abs(at(baseline, 2025).temperature - 1.36) < 0.1, 'température en 2025');
  assert.ok(Math.abs(at(baseline, 2015).temperature - 1.07) < 0.15, 'température vers 2015');
});

test('sans rien changer, on va vers environ 2,8 °C (PNUE 2025 : 1,9 à 3,7 °C)', () => {
  const t = baseline.final.temperature;
  assert.ok(t > 2.3 && t < 3.2, `2100 : ${t}`);
  assert.equal(baseline.netZeroYear, null);
  assert.ok(baseline.iceFreeYear !== null, "l'Arctique perd sa glace d'été");
});

test('le passé est identique quels que soient les leviers', () => {
  const r = M.simulate({ cleanPower: 1, directCapture: 20, stratosphericAerosols: 3 });
  assert.equal(at(r, 2025).co2, at(baseline, 2025).co2);
  assert.equal(at(r, 2025).temperature, at(baseline, 2025).temperature);
});

test('chaque levier de réduction fait baisser la température de 2100', () => {
  const tests = {
    cleanPower: 1, electricTransport: 1, heatPumps: 1, cleanIndustry: 1, energySaving: 0.5,
    stopDeforestation: 1, plantDiet: 1, methaneCut: 1, reforestation: 10, rockWeathering: 2,
    directCapture: 20, stratosphericAerosols: 3, cloudBrightening: 1, spaceSunshade: 0.02,
  };
  for (const [id, value] of Object.entries(tests)) {
    const r = M.simulate({ [id]: value });
    assert.ok(r.final.temperature < baseline.final.temperature, `${id} devrait refroidir`);
  }
});

test("les voitures électriques n'aident que si l'électricité est propre", () => {
  const dirty = M.futureEmissions({ ...M.DEFAULT_LEVERS, electricTransport: 1 }, 2050);
  const clean = M.futureEmissions({ ...M.DEFAULT_LEVERS, electricTransport: 1, cleanPower: 1 }, 2050);
  assert.ok(dirty.sectors.power > M.SECTOR_EMISSIONS_2025.power, "plus d'électricité au charbon");
  assert.ok(clean.fossil < dirty.fossil);
});

test('couper la pollution aux particules réchauffe un peu (effet de masque)', () => {
  const e = M.futureEmissions({ ...M.DEFAULT_LEVERS, cleanPower: 1 }, 2060);
  assert.ok(e.aerosols < 1);
});

test('un scénario très ambitieux repasse sous 1,5 °C en 2100', () => {
  const everything = PRESETS.find((p) => p.id === 'everything');
  const r = M.simulate(everything.levers);
  assert.ok(r.final.temperature < 1.5, `2100 : ${r.final.temperature}`);
  assert.ok(r.netZeroYear !== null && r.netZeroYear < 2045);
  assert.ok(r.peakTemperature > r.final.temperature, 'pic puis baisse');
});

test("l'accord de Paris donne environ 2 °C ou moins", () => {
  const r = M.simulate(PRESETS.find((p) => p.id === 'paris').levers);
  assert.ok(r.final.temperature < 2.2, `2100 : ${r.final.temperature}`);
});

test("la géo-ingénierie refroidit mais n'arrête pas l'acidification", () => {
  const r = M.simulate({ stratosphericAerosols: 2 });
  assert.ok(r.final.temperature < baseline.final.temperature - 0.8);
  assert.ok(Math.abs(r.final.ph - baseline.final.ph) < 0.03, 'pH presque inchangé');
});

test("le choc de terminaison : réchauffement très rapide après l'arrêt", () => {
  const r = M.simulate({ stratosphericAerosols: 2, geoStopYear: 2070 });
  const jump = at(r, 2080).temperature - at(r, 2069).temperature;
  const normal = at(baseline, 2080).temperature - at(baseline, 2069).temperature;
  assert.ok(jump > 3 * normal, `+${jump.toFixed(2)} °C en 11 ans`);
});

test('une sensibilité climatique plus forte donne plus de réchauffement', () => {
  const low = M.simulate({ climateSensitivity: 2.5 });
  const high = M.simulate({ climateSensitivity: 4 });
  assert.ok(high.final.temperature > low.final.temperature + 0.4);
});

test('le CO2 ne descend jamais sous le niveau préindustriel', () => {
  const r = M.simulate({ ...PRESETS.find((p) => p.id === 'everything').levers, directCapture: 20, reforestation: 10 });
  assert.ok(r.years.every((y) => y.co2 >= 278));
});

test('les rampes des mesures vont de 0 à 1', () => {
  assert.equal(M.rampProgress(2025, 2050), 0);
  assert.equal(M.rampProgress(2050, 2050), 1);
  assert.equal(M.rampProgress(2090, 2050), 1);
  assert.ok(Math.abs(M.rampProgress(2037.5, 2050) - 0.5) < 1e-9);
});

test('chaque levier existe dans le modèle et cite des sources connues', () => {
  const all = [...GLOBAL_LEVERS, ...LEVER_GROUPS.flatMap((g) => g.levers)];
  for (const lever of all) {
    assert.ok(lever.id in M.DEFAULT_LEVERS, `levier inconnu : ${lever.id}`);
    assert.ok(lever.sources && lever.sources.length > 0, `sans source : ${lever.id}`);
    for (const s of lever.sources) assert.ok(SOURCES[s], `source inconnue : ${s}`);
    const d = M.DEFAULT_LEVERS[lever.id];
    assert.ok(d >= lever.min && d <= lever.max, `valeur par défaut hors bornes : ${lever.id}`);
  }
});

test('toutes les sources citées dans le modèle existent', () => {
  const fs = require('node:fs');
  const code = fs.readFileSync(require.resolve('../js/model.js'), 'utf8');
  const cited = [...code.matchAll(/\[([a-z0-9_]+)\]/g)].map((m) => m[1]).filter((id) => !/^\d+$/.test(id) && id !== 'i');
  for (const id of new Set(cited)) assert.ok(SOURCES[id], `source inconnue dans model.js : ${id}`);
});
