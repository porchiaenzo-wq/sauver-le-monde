/*
 * Tests des défis : chacun doit être faisable, et ne pas être réussi d'avance.
 * Lancer avec : node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');
const { CHALLENGES } = require('../js/challenges.js');
const { LEVER_GROUPS, GLOBAL_LEVERS } = require('../js/levers.js');

const leverIds = [...GLOBAL_LEVERS, ...LEVER_GROUPS.flatMap((g) => g.levers)].map((l) => l.id);

/** Leviers d'un défi : valeurs par défaut, puis solution, puis contraintes. */
function applyChallenge(challenge, choice) {
  const levers = { ...M.DEFAULT_LEVERS, ...choice, ...challenge.locked };
  for (const [id, max] of Object.entries(challenge.limits)) levers[id] = Math.min(levers[id], max);
  return levers;
}

for (const challenge of CHALLENGES) {
  test(`défi « ${challenge.name} » : la solution fonctionne`, () => {
    const result = M.simulate(applyChallenge(challenge, challenge.solution));
    for (const g of challenge.goals) assert.ok(g.test(result), `${g.label} : ${g.value(result)}`);
  });

  test(`défi « ${challenge.name} » : la solution respecte les contraintes`, () => {
    for (const [id, value] of Object.entries(challenge.solution)) {
      if (id in challenge.locked) assert.equal(value, challenge.locked[id], `${id} est bloqué`);
      if (id in challenge.limits) assert.ok(value <= challenge.limits[id], `${id} dépasse la limite`);
    }
  });

  test(`défi « ${challenge.name} » : pas réussi sans rien faire`, () => {
    const result = M.simulate(applyChallenge(challenge, {}));
    assert.ok(!challenge.goals.every((g) => g.test(result)));
  });

  test(`défi « ${challenge.name} » : données valides`, () => {
    for (const id of [...Object.keys(challenge.locked), ...Object.keys(challenge.limits), ...Object.keys(challenge.solution)]) {
      assert.ok(leverIds.includes(id), `levier inconnu : ${id}`);
    }
    assert.ok(challenge.seconds >= 60);
    assert.ok(challenge.goals.length > 0);
  });
}
