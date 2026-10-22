/*
 * Le coût de chaque mesure.
 *
 * Pour les mesures qui réduisent ou retirent des gaz à effet de serre, le coût est donné
 * en dollars par tonne de CO2 évitée (« coût d'abattement », méthode du GIEC [ipcc_ar6_wg3]).
 * Coût annuel = tonnes évitées cette année × coût par tonne.
 * Un coût négatif est une économie : la solution coûte moins cher que celle qu'elle remplace.
 *
 * Pour la géo-ingénierie solaire, le coût est donné en dollars par an pour l'effet obtenu.
 *
 * Les chiffres sont des ordres de grandeur : chaque mesure a une fourchette (basse, haute)
 * et une valeur centrale. Ils ne comptent pas les dégâts évités par la baisse du réchauffement.
 */
(function (root) {
  'use strict';

  const Model = typeof module !== 'undefined' && module.exports ? require('./model.js') : root.ClimateModel;

  // PIB mondial 2025 : environ 117 000 milliards de dollars [imf_weo2025]
  const WORLD_GDP_BILLIONS = 117000;

  // Méthane humain en 2025 : environ 360 millions de tonnes par an [unep_methane2021],
  // soit environ 10,7 Gt d'équivalent CO2 (pouvoir de réchauffement sur 100 ans ≈ 29,8 [ipcc_ar6_wg1]).
  const METHANE_GT_CO2EQ_2025 = 0.36 * 29.8;

  /*
   * unit :
   *   'tonne' : dollars par tonne de CO2 (ou équivalent) évitée ou retirée
   *   'forcing' : milliards de dollars par an pour 1 W/m² de refroidissement
   *   'sunshade' : milliards de dollars par an pour 1 % du soleil bloqué
   */
  const COSTS = {
    energySaving: {
      unit: 'tonne', low: -50, central: -10, high: 20,
      note: 'Isoler, consommer moins et utiliser des appareils efficaces fait souvent économiser de l’argent. La sobriété a d’autres coûts, non monétaires (changer ses habitudes).',
      sources: ['ipcc_ar6_wg3'],
    },
    cleanPower: {
      unit: 'tonne', low: 0, central: 20, high: 60,
      note: 'Le solaire et l’éolien coûtent moins de 20 $ par tonne évitée, souvent moins cher que le charbon. Aller vers 100 % demande du stockage, des réseaux et du nucléaire, plus chers.',
      sources: ['ipcc_ar6_wg3'],
    },
    electricTransport: {
      unit: 'tonne', low: -50, central: 0, high: 50,
      note: 'Sur toute sa durée de vie, une voiture électrique revient souvent moins cher qu’une voiture à essence (moins de carburant et d’entretien), malgré un prix d’achat plus élevé.',
      sources: ['ipcc_ar6_wg3', 'carbonbrief_ar6wg3'],
    },
    heatPumps: {
      unit: 'tonne', low: -20, central: 30, high: 100,
      note: 'Rentable dans les logements bien isolés ; plus cher quand il faut aussi rénover le bâtiment.',
      sources: ['ipcc_ar6_wg3'],
    },
    cleanIndustry: {
      unit: 'tonne', low: 50, central: 100, high: 200,
      note: 'Acier à l’hydrogène, captage du CO₂ des cimenteries : le secteur le plus cher à décarboner.',
      sources: ['ipcc_ar6_wg3'],
    },
    stopDeforestation: {
      unit: 'tonne', low: 0, central: 10, high: 20,
      note: 'Protéger les forêts existantes est l’une des mesures les moins chères (moins de 20 $ la tonne), mais demande de surveiller et de compenser les agriculteurs.',
      sources: ['ipcc_ar6_wg3'],
    },
    plantDiet: {
      unit: 'tonne', low: 0, central: 0, high: 0,
      note: 'Changer d’alimentation n’a pas de coût d’investissement : le GIEC ne lui donne pas de prix. Elle peut même faire économiser, mais touche les éleveurs.',
      sources: ['ipcc_ar6_wg3', 'poore2018'],
    },
    methaneCut: {
      unit: 'tonne', low: -10, central: 5, high: 20,
      note: 'Réparer les fuites de gaz est souvent gratuit, voire rentable : le gaz récupéré se vend.',
      sources: ['ipcc_ar6_wg3', 'iea_methane'],
    },
    reforestation: {
      unit: 'tonne', low: 10, central: 50, high: 100,
      note: 'Planter et entretenir des forêts : environ 130 milliards de dollars par an pour 1,6 Gt de CO₂ à moins de 100 $ la tonne. Au-delà, le coût monte (terres plus chères).',
      sources: ['ipcc_ar6_wg3_ch7', 'griscom2017'],
    },
    rockWeathering: {
      unit: 'tonne', low: 80, central: 130, high: 180,
      note: 'Extraire, broyer, transporter et épandre la roche : environ 80 à 180 $ la tonne de CO₂ retirée.',
      sources: ['beerling2020'],
    },
    directCapture: {
      unit: 'tonne', low: 100, central: 200, high: 300,
      note: 'Le GIEC estime 100 à 300 $ la tonne pour de grandes usines futures. Aujourd’hui, c’est plutôt 600 à 1 000 $ la tonne, stockage compris.',
      sources: ['ipcc_ar6_wg3', 'iea_dac'],
    },
    stratosphericAerosols: {
      unit: 'forcing', low: 5, central: 10, high: 20,
      note: 'Une flotte d’avions spéciaux coûterait quelques milliards de dollars par an : très peu cher, ce qui fait craindre qu’un seul pays décide de le faire. Les dégâts possibles (pluies, ozone) ne sont pas comptés.',
      sources: ['smithwagner2018', 'nasem2021'],
    },
    cloudBrightening: {
      unit: 'forcing', low: 5, central: 20, high: 50,
      note: 'Coût très mal connu : la technique n’a jamais été testée à grande échelle.',
      sources: ['nasem2021', 'latham2008'],
    },
    spaceSunshade: {
      unit: 'sunshade', low: 30, central: 55, high: 150,
      note: 'Quelques milliers de milliards de dollars au total, soit environ 100 milliards par an sur 50 ans pour bloquer 1,8 % du soleil.',
      sources: ['angel2006'],
    },
  };

  // Ordre de calcul : on ajoute les mesures une à une, et chacune reçoit les tonnes qu'elle évite
  // en plus des précédentes (sinon on compterait deux fois les mêmes tonnes).
  const ABATEMENT_ORDER = [
    'energySaving', 'cleanPower', 'electricTransport', 'heatPumps', 'cleanIndustry',
    'stopDeforestation', 'plantDiet', 'methaneCut', 'reforestation', 'rockWeathering', 'directCapture',
  ];

  /** Émissions nettes en Gt d'équivalent CO2 (CO2 + méthane), à partir du détail des émissions. */
  function netFromDetail(e) {
    return e.fossil + e.landUse - e.removals + e.methane * METHANE_GT_CO2EQ_2025;
  }

  /**
   * Calcul commun. emit(levers) donne le détail des émissions ; geoCooling(levers, id) le refroidissement
   * (W/m²) obtenu par une technique de géo-ingénierie seule.
   */
  function costsWith(levers, emit, geoCooling) {
    const items = [];

    // Mesures qui évitent des émissions : tonnes × coût par tonne
    let current = { ...Model.DEFAULT_LEVERS, targetYear: levers.targetYear };
    let previous = netFromDetail(emit(current));
    for (const id of ABATEMENT_ORDER) {
      current = { ...current, [id]: levers[id] };
      const now = netFromDetail(emit(current));
      const tonnes = previous - now; // Gt évitées par cette mesure
      previous = now;
      if (Math.abs(tonnes) < 1e-9) continue;
      const c = COSTS[id];
      items.push({ id, tonnes, low: tonnes * c.low, central: tonnes * c.central, high: tonnes * c.high });
    }

    // Géo-ingénierie solaire : coût par an selon l'effet obtenu
    for (const id of ['stratosphericAerosols', 'cloudBrightening', 'spaceSunshade']) {
      if (!levers[id]) continue;
      const forcing = geoCooling(levers, id); // W/m² de refroidissement
      if (forcing <= 0) continue;
      const c = COSTS[id];
      const amount = c.unit === 'sunshade' ? (forcing / Model.ABSORBED_SUNLIGHT) * 100 : forcing; // % du soleil ou W/m²
      items.push({ id, tonnes: 0, low: amount * c.low, central: amount * c.central, high: amount * c.high });
    }

    const total = items.reduce(
      (t, i) => ({ low: t.low + i.low, central: t.central + i.central, high: t.high + i.high }),
      { low: 0, central: 0, high: 0 }
    );
    return { items, total, gdpShare: total.central / WORLD_GDP_BILLIONS };
  }

  /**
   * Coût de chaque mesure pour une année donnée du simulateur.
   * Retourne { items: [{ id, tonnes, low, central, high }], total: { low, central, high }, gdpShare }
   * en milliards de dollars par an.
   */
  function computeCosts(inputLevers, year) {
    const levers = Object.assign({}, Model.DEFAULT_LEVERS, inputLevers || {});
    const result = costsWith(
      levers,
      (l) => Model.futureEmissions(l, year),
      (l, id) => {
        const only = { ...Model.DEFAULT_LEVERS, geoStartYear: l.geoStartYear, geoStopYear: l.geoStopYear, [id]: l[id] };
        return -Model.geoengineeringForcing(only, year);
      }
    );
    return { year, ...result };
  }

  /**
   * Coût par an de mesures déjà déployées à ces valeurs (pour le jeu, qui gère lui-même le déploiement).
   */
  function computeCostsDeployed(inputLevers) {
    const levers = Object.assign({}, Model.DEFAULT_LEVERS, inputLevers || {});
    return costsWith(
      levers,
      (l) => Model.emissionsAt(l, 1, 1),
      (l, id) => (id === 'spaceSunshade' ? l[id] * Model.ABSORBED_SUNLIGHT : l[id])
    );
  }

  /** Coût par tonne lisible, pour la fiche d'une mesure. */
  function describeUnitCost(id) {
    const c = COSTS[id];
    if (!c) return '';
    const n = (v) => v.toLocaleString('fr-FR');
    if (c.unit === 'tonne') {
      if (c.low === 0 && c.high === 0) return 'Pas de coût direct chiffré';
      return `${n(c.low)} à ${n(c.high)} $ par tonne de CO₂ (≈ ${n(c.central)} $)`;
    }
    if (c.unit === 'forcing') return `${n(c.low)} à ${n(c.high)} milliards $ par an et par W/m² (≈ ${n(c.central)})`;
    return `${n(c.low)} à ${n(c.high)} milliards $ par an pour 1 % du soleil bloqué (≈ ${n(c.central)})`;
  }

  const api = { COSTS, computeCosts, computeCostsDeployed, describeUnitCost, WORLD_GDP_BILLIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Costs = api;
})(typeof window !== 'undefined' ? window : globalThis);
