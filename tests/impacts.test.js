/*
 * Tests de la carte des impacts.
 * Lancer avec : node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { REGION_IMPACTS, regionLevel, hotExtremeFactor } = require('../js/impacts.js');
const { WORLD_MAP } = require('../js/world-map.js');
const { SOURCES } = require('../js/sources.js');

test('chaque région a une forme sur la carte, et inversement', () => {
  assert.deepEqual(Object.keys(REGION_IMPACTS).sort(), Object.keys(WORLD_MAP.regions).sort());
  for (const r of Object.values(WORLD_MAP.regions)) assert.ok(r.d.startsWith('M'));
});

test('chaque impact a un seuil plausible et des sources connues', () => {
  for (const [id, region] of Object.entries(REGION_IMPACTS)) {
    assert.ok(region.impacts.length >= 3, id);
    for (const impact of region.impacts) {
      assert.ok(impact.threshold >= 1 && impact.threshold <= 5, `${id} : ${impact.text}`);
      for (const s of impact.sources) assert.ok(SOURCES[s], `source inconnue : ${s}`);
    }
    for (const s of region.sources || []) assert.ok(SOURCES[s], `source inconnue : ${s}`);
  }
});

test('le risque ne baisse jamais quand la température monte', () => {
  for (const id of Object.keys(REGION_IMPACTS)) {
    let previous = 0;
    for (let t = 0; t <= 5; t += 0.1) {
      const level = regionLevel(id, t);
      assert.ok(level >= previous, `${id} à ${t.toFixed(1)} °C`);
      previous = level;
    }
    assert.equal(regionLevel(id, 1), 0, `${id} : pas de risque élevé sous 1 °C`);
    assert.ok(regionLevel(id, 4.5) >= 3, `${id} : risque au moins très élevé à 4,5 °C`);
  }
});

test('la carte est nuancée : à 2,7 °C, toutes les régions ne sont pas au même niveau', () => {
  const levels = new Set(Object.keys(REGION_IMPACTS).map((id) => regionLevel(id, 2.7)));
  assert.ok(levels.size >= 3, `niveaux : ${[...levels]}`);
});

test('chaque risque a une gravité de 1 à 3, et chaque région une vulnérabilité', () => {
  for (const [id, region] of Object.entries(REGION_IMPACTS)) {
    assert.ok(region.vulnerability >= 1 && region.vulnerability <= 1.2, id);
    for (const impact of region.impacts) assert.ok([1, 2, 3].includes(impact.weight), `${id} : ${impact.text}`);
  }
});

test('chaleurs extrêmes : les valeurs du GIEC (4,1 fois à 1,5 °C, 5,6 à 2 °C, 9,4 à 4 °C)', () => {
  assert.equal(hotExtremeFactor(1.5), 4.1);
  assert.equal(hotExtremeFactor(2), 5.6);
  assert.equal(hotExtremeFactor(4), 9.4);
  assert.ok(hotExtremeFactor(3) > 5.6 && hotExtremeFactor(3) < 9.4);
});
