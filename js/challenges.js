/*
 * Les défis : un objectif à atteindre avant la fin du chrono, avec des contraintes.
 *
 * Pour chaque défi :
 *   goals     : conditions à remplir, testées sur le résultat de la simulation
 *   locked    : leviers bloqués à une valeur (le curseur est grisé)
 *   limits    : valeur maximale autorisée pour certains leviers
 *   seconds   : temps imparti
 *   budget    : coût maximal en 2050 (milliards de dollars par an, valeur centrale de js/costs.js)
 *   thrifty   : coût en dessous duquel on gagne la 3e étoile
 *   solution  : une solution qui marche dans le budget (vérifiée par les tests, montrée en cas d'échec)
 *   lesson    : ce que le défi apprend, affiché à la fin
 */
(function (root) {
  'use strict';

  const fmt = (v, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

  // Objectifs réutilisables
  const goal = {
    finalBelow: (max) => ({
      label: `Réchauffement en 2100 sous ${fmt(max)} °C`,
      test: (r) => r.final.temperature < max,
      value: (r) => `${fmt(r.final.temperature)} °C`,
    }),
    finalAbove: (min) => ({
      label: `Réchauffement en 2100 au-dessus de ${fmt(min)} °C (trop refroidir dérègle aussi le climat)`,
      test: (r) => r.final.temperature > min,
      value: (r) => `${fmt(r.final.temperature)} °C`,
    }),
    peakBelow: (max) => ({
      label: `Pic de réchauffement sous ${fmt(max)} °C`,
      test: (r) => r.peakTemperature < max,
      value: (r) => `${fmt(r.peakTemperature, 2)} °C`,
    }),
    arcticSaved: () => ({
      label: 'La banquise arctique ne disparaît jamais en été',
      test: (r) => r.iceFreeYear === null,
      value: (r) => (r.iceFreeYear ? `disparaît en ${r.iceFreeYear}` : 'sauvée'),
    }),
    withinBudget: (max) => ({
      label: `Coût en 2050 sous ${max.toLocaleString('fr-FR')} milliards $ par an`,
      test: (r, costs) => costs.total.central <= max,
      value: (r, costs) => `${Math.round(costs.total.central).toLocaleString('fr-FR')} milliards $`,
    }),
    phAbove: (min) => ({
      label: `Océans pas plus acides qu’aujourd’hui (pH ≥ ${fmt(min, 2)} en 2100)`,
      test: (r) => r.final.ph >= min,
      value: (r) => `pH ${fmt(r.final.ph, 2)}`,
    }),
  };

  // Interdire toute la géo-ingénierie solaire
  const NO_GEOENGINEERING = { stratosphericAerosols: 0, cloudBrightening: 0, spaceSunshade: 0, geoStartYear: 2035 };

  const CHALLENGES = [
    {
      id: 'paris',
      level: 1,
      name: 'L’accord de Paris',
      pitch: 'Garde le réchauffement sous 2 °C, sans toucher au soleil.',
      seconds: 120,
      goals: [goal.finalBelow(2)],
      locked: NO_GEOENGINEERING,
      limits: {},
      budget: 1300,
      thrifty: 1100,
      solution: {
        targetYear: 2055, energySaving: 0.5, cleanPower: 0.75, electricTransport: 1, heatPumps: 0.9, cleanIndustry: 0.8,
        stopDeforestation: 1, methaneCut: 1, reforestation: 3, directCapture: 3,
      },
      lesson:
        'Presque tous les pays ont signé l’accord de Paris en 2015. Le tenir demande de réduire les émissions dans tous les secteurs à la fois : il n’existe pas de solution miracle unique.',
    },
    {
      id: 'arctic',
      level: 2,
      name: 'Sauver l’Arctique',
      pitch: 'La banquise d’été ne doit jamais disparaître. Sans géo-ingénierie.',
      seconds: 150,
      goals: [goal.arcticSaved()],
      locked: NO_GEOENGINEERING,
      limits: {},
      budget: 2300,
      thrifty: 2000,
      solution: {
        energySaving: 0.5, cleanPower: 0.5, electricTransport: 1, heatPumps: 0.4, cleanIndustry: 0.45, stopDeforestation: 0.5,
        plantDiet: 1, methaneCut: 0.55, reforestation: 3, rockWeathering: 1, directCapture: 7.5,
      },
      lesson:
        'La banquise de septembre fond d’environ 3 m² pour chaque tonne de CO₂ émise (Notz et Stroeve, 2016). Elle est déjà très réduite : il faut agir vite, car le méthane et la pollution aux particules jouent aussi sur les prochaines décennies.',
    },
    {
      id: 'pessimist',
      level: 2,
      name: 'Le climat est plus sensible',
      pitch: 'Et si les scientifiques pessimistes avaient raison ? Sensibilité bloquée à 4 °C.',
      seconds: 150,
      goals: [goal.finalBelow(2)],
      locked: { ...NO_GEOENGINEERING, climateSensitivity: 4 },
      limits: {},
      budget: 2700,
      thrifty: 2300,
      solution: {
        targetYear: 2055, energySaving: 0.5, cleanPower: 1, electricTransport: 1, heatPumps: 0.9, cleanIndustry: 1,
        stopDeforestation: 1, plantDiet: 0.5, methaneCut: 1, reforestation: 8, directCapture: 8,
      },
      lesson:
        'La sensibilité du climat est probablement entre 2,5 et 4 °C (GIEC). Comme on ne la connaît pas exactement, il vaut mieux prévoir une marge de sécurité.',
    },
    {
      id: 'slow',
      level: 3,
      name: 'Le monde est lent',
      pitch: 'Les changements prennent jusqu’en 2070. Les aspirateurs à CO₂ sont limités à 5 Gt.',
      seconds: 180,
      goals: [goal.finalBelow(2)],
      locked: { ...NO_GEOENGINEERING, targetYear: 2070 },
      limits: { directCapture: 5 },
      budget: 1300,
      thrifty: 1100,
      solution: {
        energySaving: 0.5, cleanPower: 0.7, electricTransport: 1, heatPumps: 0.7, cleanIndustry: 0.75, stopDeforestation: 0.75,
        plantDiet: 0.6, methaneCut: 0.8, reforestation: 5.5, rockWeathering: 0.5, directCapture: 5,
      },
      lesson:
        'Chaque année de retard ajoute du CO₂ qui restera des siècles. Une transition lente oblige à des efforts beaucoup plus grands sur tout le reste, et à retirer du CO₂ de l’air.',
    },
    {
      id: 'real15',
      level: 3,
      name: 'Le vrai 1,5 °C',
      pitch: 'Repasser sous 1,5 °C en 2100, avec au plus 2 Gt d’aspirateurs à CO₂ et sans géo-ingénierie.',
      seconds: 180,
      goals: [goal.finalBelow(1.5)],
      locked: NO_GEOENGINEERING,
      limits: { directCapture: 2 },
      budget: 1800,
      thrifty: 1700,
      solution: {
        targetYear: 2041, energySaving: 0.5, cleanPower: 0.95, electricTransport: 1, heatPumps: 0.95, cleanIndustry: 0.95,
        stopDeforestation: 1, plantDiet: 1, methaneCut: 1, reforestation: 10, rockWeathering: 2, directCapture: 2,
      },
      lesson:
        'Selon le GIEC, il ne reste presque plus de budget carbone pour 1,5 °C (environ 130 Gt de CO₂ début 2025, soit 3 ans d’émissions). Y revenir en 2100 suppose de dépasser ce seuil, puis de retirer du CO₂ en masse.',
    },
    {
      id: 'corals',
      level: 3,
      name: 'Sauver les coraux',
      pitch: 'Ne jamais dépasser 1,5 °C, sans acidifier plus les océans ni trop refroidir la Terre. Géo-ingénierie autorisée.',
      seconds: 240,
      goals: [goal.peakBelow(1.5), goal.phAbove(8.05), goal.finalAbove(1)],
      locked: {},
      limits: {},
      budget: 1100,
      thrifty: 900,
      solution: {
        targetYear: 2055, energySaving: 0.5, cleanPower: 0.9, electricTransport: 1, heatPumps: 0.5, cleanIndustry: 0.3,
        stopDeforestation: 0.7, plantDiet: 1, reforestation: 5, directCapture: 3, stratosphericAerosols: 1.1, geoStartYear: 2030,
      },
      lesson:
        'Les coraux souffrent à la fois de la chaleur et de l’acidité de l’eau. La géo-ingénierie peut éviter le pic de chaleur, mais seule la baisse du CO₂ protège les océans de l’acidification.',
    },
  ];

  // Chaque défi doit aussi tenir dans son budget.
  for (const c of CHALLENGES) c.goals.push(goal.withinBudget(c.budget));

  const LEVEL_NAMES = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile' };

  const api = { CHALLENGES, LEVEL_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
