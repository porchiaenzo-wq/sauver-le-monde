/*
 * Tests des défis : chacun doit être faisable, et ne pas être réussi d'avance.
 * Lancer avec : node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');
const C = require('../js/costs.js');
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
  test(`défi « ${challenge.name} » : la solution fonctionne, dans le budget`, () => {
    const levers = applyChallenge(challenge, challenge.solution);
    const result = M.simulate(levers);
    const costs = C.computeCosts(levers, 2050);
    for (const g of challenge.goals) assert.ok(g.test(result, costs), `${g.label} : ${g.value(result, costs)}`);
  });

  test(`défi « ${challenge.name} » : la 3e étoile (petit budget) est atteignable`, () => {
    assert.ok(challenge.thrifty < challenge.budget);
    const cost = C.computeCosts(applyChallenge(challenge, challenge.solution), 2050).total.central;
    assert.ok(cost <= challenge.thrifty, `${Math.round(cost)} > ${challenge.thrifty}`);
  });

  // Pour « Le vrai 1,5 °C », la difficulté vient du climat (aspirateurs à CO2 limités) :
  // même tout au maximum, on reste proche du coût minimal, donc le budget ne bloque pas.
  if (challenge.id !== 'real15') test(`défi « ${challenge.name} » : tout pousser au maximum dépasse le budget`, () => {
    const all = { cleanPower: 1, electricTransport: 1, heatPumps: 1, cleanIndustry: 1, energySaving: 0.5,
      stopDeforestation: 1, plantDiet: 1, methaneCut: 1, reforestation: 10, rockWeathering: 2, directCapture: 20 };
    const cost = C.computeCosts(applyChallenge(challenge, all), 2050).total.central;
    assert.ok(cost > challenge.budget);
  });

  test(`défi « ${challenge.name} » : la solution respecte les contraintes`, () => {
    for (const [id, value] of Object.entries(challenge.solution)) {
      if (id in challenge.locked) assert.equal(value, challenge.locked[id], `${id} est bloqué`);
      if (id in challenge.limits) assert.ok(value <= challenge.limits[id], `${id} dépasse la limite`);
    }
  });

  test(`défi « ${challenge.name} » : pas réussi sans rien faire`, () => {
    const levers = applyChallenge(challenge, {});
    const result = M.simulate(levers);
    const costs = C.computeCosts(levers, 2050);
    assert.ok(!challenge.goals.every((g) => g.test(result, costs)));
  });

  test(`défi « ${challenge.name} » : données valides`, () => {
    for (const id of [...Object.keys(challenge.locked), ...Object.keys(challenge.limits), ...Object.keys(challenge.solution)]) {
      assert.ok(leverIds.includes(id), `levier inconnu : ${id}`);
    }
    assert.ok(challenge.seconds >= 60);
    assert.ok(challenge.goals.length > 0);
  });
}
