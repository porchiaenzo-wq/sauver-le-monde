/*
 * Moteur de simulation climatique simplifié.
 *
 * Chaîne de calcul, une année à la fois :
 *   leviers -> émissions (CO2, méthane, aérosols)
 *           -> concentration de CO2 (cycle du carbone à 4 réservoirs)
 *           -> forçage radiatif (W/m²)
 *           -> température (modèle à deux couches : surface + océan profond)
 *           -> conséquences (niveau des mers, banquise, acidité, points de bascule)
 *
 * Toutes les constantes viennent de publications citées dans js/sources.js
 * (identifiants entre crochets, par exemple [joos2013]).
 *
 * Le fichier fonctionne dans le navigateur (variable globale ClimateModel)
 * et dans Node.js (module.exports) pour les tests.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constantes physiques et données de départ
  // ---------------------------------------------------------------------------

  const START_YEAR = 1850;
  const PRESENT_YEAR = 2025;
  const END_YEAR = 2100;

  const PREINDUSTRIAL_CO2_PPM = 278; // [ipcc_ar6_wg1]
  const GTC_PER_PPM = 2.124; // 1 ppm de CO2 = 2,124 milliards de tonnes de carbone [gcb2025]
  const GTCO2_PER_GTC = 3.664; // masse molaire CO2 / C

  // Réponse impulsionnelle du cycle du carbone : part d'une émission de CO2
  // qui reste dans l'air, répartie en 4 réservoirs aux durées différentes [joos2013].
  const CARBON_POOL_SHARES = [0.2173, 0.224, 0.2824, 0.2763];
  const CARBON_POOL_LIFETIMES = [Infinity, 394.4, 36.54, 4.304]; // années
  const MEASURED_CO2_2025 = 425.7; // ppm, moyenne annuelle [gcb2025] [noaa_gml]
  // Durée de séjour du CO2 sur 100 ans (années) : base, saturation des puits par Gt de carbone
  // absorbée, et effet de la chaleur par degré [millar2017]. La base (35 ans dans l'article)
  // est ajustée à 32,3 ans pour que le modèle retrouve le CO2 mesuré en 2025.
  const IIRF100_BASE = 32.3;
  const IIRF100_PER_GTC = 0.019;
  const IIRF100_PER_DEGREE = 4.165;
  const IIRF100_MAX = 97;

  // Forçage du CO2 : F = 5,35 × ln(C / C0) W/m² [myhre1998]
  const CO2_FORCING_COEFF = 5.35;
  const F2X = CO2_FORCING_COEFF * Math.log(2); // forçage d'un doublement du CO2, ≈ 3,7 W/m²

  // Modèle à deux couches [geoffroy2013] : capacités thermiques (W·an/m²/°C)
  // et échange de chaleur entre la surface et l'océan profond.
  const HEAT_CAPACITY_SURFACE = 7.3;
  const HEAT_CAPACITY_DEEP = 106;
  const DEEP_OCEAN_EXCHANGE = 0.73;
  // « Efficacité » de l'océan profond : la chaleur qu'il absorbe freine plus la surface
  // qu'un simple calcul ne le prévoit (effet des motifs de réchauffement).
  const DEEP_OCEAN_EFFICACY = 1.28;

  // Forçages hors CO2 en 2025 (W/m²), d'après le bilan du GIEC actualisé [ipcc_ar6_wg1] [forster2025]
  const METHANE_FORCING_2025 = 0.56;
  const OTHER_GHG_FORCING_2025 = 1.0; // protoxyde d'azote, gaz fluorés, ozone, autres
  const AEROSOL_FORCING_2025 = -1.1; // pollution aux particules : elle refroidit (masque une partie du réchauffement)
  const METHANE_LIFETIME = 12; // années [ipcc_ar6_wg1]

  // Émissions fossiles de CO2 en 2025 par secteur (milliards de tonnes de CO2 par an).
  // Total ≈ 38,1 Gt [gcb2025] ; répartition approximative [owid_co2] [iea_weo].
  const SECTOR_EMISSIONS_2025 = {
    power: 15.2, // électricité et chaleur
    transport: 8.4,
    buildings: 3.0, // chauffage au gaz et au fioul
    industry: 9.6, // acier, ciment, chimie (procédés compris)
    other: 1.9,
  };
  const LAND_USE_EMISSIONS_2025 = 4.1; // déforestation, Gt CO2/an [gcb2025]

  const CLEAN_POWER_SHARE_2025 = 0.4; // part bas carbone de l'électricité mondiale [ember2025]
  const TRANSPORT_ELECTRIC_SHARE_2025 = 0.02;
  // Électrifier tout le transport (ou tout le chauffage) augmente la demande
  // d'électricité d'environ 27 % (ou 10 %), grâce au meilleur rendement des moteurs électriques
  // et des pompes à chaleur [iea_nze].
  const TRANSPORT_EXTRA_POWER = 0.27;
  const HEATING_EXTRA_POWER = 0.1;

  // Méthane d'origine humaine, part par source [unep_methane2021]
  const METHANE_SHARES = { fossil: 0.35, livestock: 0.32, rice: 0.08, waste: 0.2, other: 0.05 };
  const FOSSIL_METHANE_ABATABLE = 0.7; // fuites de pétrole et de gaz évitables [iea_methane]
  const WASTE_METHANE_ABATABLE = 0.6;

  // Rétroaction du pergélisol : 18 Gt de carbone libérées par degré [ipcc_ar6_wg1]
  const PERMAFROST_GTC_PER_DEGREE = 18;
  const PERMAFROST_RELEASE_TIME = 50; // années

  // Soleil : rayonnement absorbé en moyenne par la Terre ≈ 240 W/m² [ipcc_ar6_wg1]
  const ABSORBED_SUNLIGHT = 240;

  // Niveau des mers, relation semi-empirique [rahmstorf2007] :
  // vitesse de montée = 3,4 mm/an par degré, au-dessus d'un seuil de -0,2 °C.
  const SEA_LEVEL_RATE = 3.4;
  const SEA_LEVEL_OFFSET = 0.2;

  // Banquise arctique de septembre : 3 m² perdus par tonne de CO2 émise [notz2016],
  // soit environ 6,7 millions de km² par degré de réchauffement.
  const SEA_ICE_2025 = 4.4; // millions de km² [nsidc]
  const SEA_ICE_PER_DEGREE = 6.7;
  const SEA_ICE_FREE = 1; // « libre de glace » sous 1 million de km² [notz2016]

  // Acidité des océans : approximation du pH de surface (≈ 8,17 avant l'ère industrielle,
  // baisse d'environ 0,1 aujourd'hui) [ipcc_ar6_wg1].
  const PH_PREINDUSTRIAL = 8.17;
  const PH_SLOPE = 0.29;

  // Points de bascule : seuil de réchauffement estimé (°C) [armstrongmckay2022]
  const TIPPING_POINTS = [
    { id: 'reefs', name: 'Récifs coralliens tropicaux', threshold: 1.5, range: '1 à 2 °C' },
    { id: 'greenland', name: 'Calotte du Groenland', threshold: 1.5, range: '0,8 à 3 °C' },
    { id: 'westAntarctic', name: "Calotte de l'Antarctique de l'Ouest", threshold: 1.5, range: '1 à 3 °C' },
    { id: 'permafrost', name: 'Dégel brutal du pergélisol boréal', threshold: 1.5, range: '1 à 2,3 °C' },
    { id: 'barents', name: 'Glace de la mer de Barents', threshold: 1.6, range: '1,5 à 1,7 °C' },
    { id: 'labrador', name: 'Courant de la mer du Labrador', threshold: 1.8, range: '1,1 à 3,8 °C' },
    { id: 'glaciers', name: 'Glaciers de montagne', threshold: 2, range: '1,5 à 3 °C' },
    { id: 'amazon', name: 'Forêt amazonienne', threshold: 3.5, range: '2 à 6 °C' },
    { id: 'amoc', name: 'Grand courant atlantique (AMOC)', threshold: 4, range: '1,4 à 8 °C' },
  ];

  // Émissions historiques de CO2 (Gt de carbone par an), points de repère interpolés [gcb2025].
  const HISTORY_FOSSIL_GTC = [
    [1850, 0.05], [1900, 0.53], [1925, 1.0], [1950, 1.63], [1960, 2.57], [1970, 4.05],
    [1980, 5.29], [1990, 6.12], [2000, 6.83], [2010, 9.06], [2015, 9.65], [2020, 9.5], [2025, 10.4],
  ];
  const HISTORY_LAND_GTC = [
    [1850, 0.6], [1900, 0.75], [1950, 1.3], [1980, 1.4], [2000, 1.4], [2025, 1.1],
  ];

  /** Émissions historiques nettes de CO2 d'une année (Gt CO2). */
  function historicalEmissions(year) {
    return (interpolate(HISTORY_FOSSIL_GTC, year) + interpolate(HISTORY_LAND_GTC, year)) * GTCO2_PER_GTC;
  }

  /** Coefficients de vidange annuelle des réservoirs, pour un ralentissement alpha donné. */
  function poolDecay(alpha) {
    return CARBON_POOL_LIFETIMES.map((tau) => (tau === Infinity ? 1 : Math.exp(-1 / (alpha * tau))));
  }

  /**
   * Vitesse d'absorption du CO2 par les océans et les forêts, comme dans le modèle FaIR
   * [millar2017] [smith2018]. Plus les puits ont déjà absorbé de carbone, et plus il fait chaud,
   * plus ils se saturent : le CO2 reste alors plus longtemps dans l'air.
   * On cherche le coefficient alpha qui donne la bonne « durée de séjour sur 100 ans ».
   */
  function sinkSlowdown(cumulativeUptakeGtC, temperature) {
    const target = Math.min(
      IIRF100_MAX,
      IIRF100_BASE + IIRF100_PER_GTC * cumulativeUptakeGtC + IIRF100_PER_DEGREE * temperature
    );
    const iirf = (alpha) =>
      CARBON_POOL_SHARES.reduce(
        (sum, share, i) =>
          sum +
          (CARBON_POOL_LIFETIMES[i] === Infinity
            ? share * 100
            : share * alpha * CARBON_POOL_LIFETIMES[i] * (1 - Math.exp(-100 / (alpha * CARBON_POOL_LIFETIMES[i])))),
        0
      );
    let low = 0.01;
    let high = 100;
    for (let step = 0; step < 50; step++) {
      const mid = Math.sqrt(low * high);
      if (iirf(mid) < target) low = mid;
      else high = mid;
    }
    return Math.sqrt(low * high);
  }


  // ---------------------------------------------------------------------------
  // Leviers : valeurs par défaut (= rien ne change) et bornes
  // ---------------------------------------------------------------------------

  const DEFAULT_LEVERS = {
    targetYear: 2050, // année où chaque mesure atteint son plein effet
    energySaving: 0, // baisse de la demande d'énergie (sobriété, efficacité), 0 à 0,5
    cleanPower: CLEAN_POWER_SHARE_2025, // part bas carbone de l'électricité, 0,4 à 1
    electricTransport: TRANSPORT_ELECTRIC_SHARE_2025, // part électrique des transports, 0,02 à 1
    heatPumps: 0, // part du chauffage fossile remplacée par des pompes à chaleur, 0 à 1
    cleanIndustry: 0, // décarbonation de l'industrie, 0 à 1
    stopDeforestation: 0, // 0 à 1
    reforestation: 0, // Gt CO2 absorbées par an, 0 à 10
    plantDiet: 0, // baisse de la consommation de produits animaux, 0 à 1
    methaneCut: 0, // part des fuites et déchets évitables traités, 0 à 1
    rockWeathering: 0, // altération forcée des roches, Gt CO2/an, 0 à 2
    directCapture: 0, // captage direct du CO2 dans l'air, Gt CO2/an, 0 à 20
    stratosphericAerosols: 0, // refroidissement par aérosols stratosphériques, W/m², 0 à 3
    cloudBrightening: 0, // éclaircissement des nuages marins, W/m², 0 à 1
    spaceSunshade: 0, // part du soleil bloquée par un pare-soleil spatial, 0 à 0,02
    geoStartYear: 2035, // début de la géo-ingénierie solaire
    geoStopYear: null, // arrêt brutal (null = jamais)
    climateSensitivity: 3, // réchauffement à l'équilibre pour un doublement du CO2 (°C) [sherwood2020]
  };

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  /** Interpolation linéaire dans une liste de points [année, valeur]. */
  function interpolate(points, year) {
    if (year <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [y1, v1] = points[i];
      if (year <= y1) {
        const [y0, v0] = points[i - 1];
        return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
      }
    }
    return points[points.length - 1][1];
  }

  /** Avancement d'une mesure : 0 en 2025, 1 à l'année cible, puis 1. */
  function rampProgress(year, targetYear, delay) {
    const start = PRESENT_YEAR + (delay || 0);
    const end = Math.max(targetYear + (delay || 0), start + 1);
    if (year <= start) return 0;
    if (year >= end) return 1;
    return (year - start) / (end - start);
  }

  // ---------------------------------------------------------------------------
  // Émissions futures selon les leviers
  // ---------------------------------------------------------------------------

  /**
   * Calcule les émissions d'une année future (après 2025).
   * Retourne les émissions par secteur (Gt CO2/an), le méthane et les aérosols
   * en proportion de 2025.
   */
  function futureEmissions(levers, year) {
    const r = rampProgress(year, levers.targetYear);
    // Les forêts plantées mettent une dizaine d'années à pousser.
    const rForest = rampProgress(year, levers.targetYear, 10);
    return emissionsAt(levers, r, rForest);
  }

  /**
   * Émissions quand chaque mesure est appliquée à la fraction r de sa valeur (rForest pour le reboisement).
   * Avec r = 1, les leviers sont pris tels quels : c'est ce qu'utilise le jeu, qui gère lui-même le déploiement.
   */
  function emissionsAt(levers, r, rForest) {
    const s = SECTOR_EMISSIONS_2025;

    const demand = 1 - levers.energySaving * r;
    const cleanShare = CLEAN_POWER_SHARE_2025 + (levers.cleanPower - CLEAN_POWER_SHARE_2025) * r;
    const evShare =
      TRANSPORT_ELECTRIC_SHARE_2025 + (levers.electricTransport - TRANSPORT_ELECTRIC_SHARE_2025) * r;
    const heatPumpShare = levers.heatPumps * r;

    // Les voitures électriques et les pompes à chaleur consomment de l'électricité :
    // elles n'aident vraiment que si cette électricité est bas carbone.
    const extraPower =
      1 +
      (TRANSPORT_EXTRA_POWER * (evShare - TRANSPORT_ELECTRIC_SHARE_2025)) /
        (1 - TRANSPORT_ELECTRIC_SHARE_2025) +
      HEATING_EXTRA_POWER * heatPumpShare;

    const sectors = {
      power: (s.power * demand * (1 - cleanShare) * extraPower) / (1 - CLEAN_POWER_SHARE_2025),
      transport: (s.transport * demand * (1 - evShare)) / (1 - TRANSPORT_ELECTRIC_SHARE_2025),
      buildings: s.buildings * demand * (1 - heatPumpShare),
      industry: s.industry * demand * (1 - levers.cleanIndustry * r),
      other: s.other * demand,
    };
    const fossil = sectors.power + sectors.transport + sectors.buildings + sectors.industry + sectors.other;

    // Moins de viande = moins de pâturages et de cultures fourragères, donc moins de déforestation.
    const landUse =
      LAND_USE_EMISSIONS_2025 * (1 - levers.stopDeforestation * r) * (1 - 0.3 * levers.plantDiet * r);

    const removals =
      levers.reforestation * rForest + levers.rockWeathering * r + levers.directCapture * r;

    const fossilRatio = fossil / (s.power + s.transport + s.buildings + s.industry + s.other);
    const m = METHANE_SHARES;
    const methane =
      m.fossil * fossilRatio * (1 - FOSSIL_METHANE_ABATABLE * levers.methaneCut * r) +
      m.livestock * (1 - levers.plantDiet * r) +
      m.rice +
      m.waste * (1 - WASTE_METHANE_ABATABLE * levers.methaneCut * r) +
      m.other;

    // La pollution aux particules vient surtout de la combustion (centrales, usines, moteurs).
    const combustion2025 = s.power + s.industry + s.transport;
    const aerosols = (sectors.power + sectors.industry + sectors.transport) / combustion2025;

    return { sectors, fossil, landUse, removals, methane, aerosols };
  }

  /** Forçage de la géo-ingénierie solaire (W/m², négatif = refroidit). */
  function geoengineeringForcing(levers, year) {
    if (year < levers.geoStartYear) return 0;
    if (levers.geoStopYear != null && year >= levers.geoStopYear) return 0;
    // Montée en puissance sur 10 ans.
    const ramp = Math.min(1, (year - levers.geoStartYear + 1) / 10);
    const sunshade = levers.spaceSunshade * ABSORBED_SUNLIGHT;
    return -ramp * (levers.stratosphericAerosols + levers.cloudBrightening + sunshade);
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  /**
   * Lance la simulation de 1850 à 2100.
   * Les années 1850 à 2025 rejouent l'histoire réelle (mêmes résultats pour tous les scénarios),
   * les leviers agissent à partir de 2026.
   */
  function simulate(inputLevers) {
    const levers = Object.assign({}, DEFAULT_LEVERS, inputLevers || {});
    const state = createState(levers.climateSensitivity);
    for (let year = PRESENT_YEAR + 1; year <= END_YEAR; year++) {
      stepYear(state, futureEmissions(levers, year), geoengineeringForcing(levers, year));
    }
    return summarize(state.years, state.tPresent, state.peakSinceToday, state.co2ForcingPresent);
  }

  /**
   * État du climat, prêt à avancer année par année. Les années 1850 à 2025 rejouent l'histoire réelle.
   * Le jeu (js/game-engine.js) s'en sert pour faire avancer le monde selon les décisions du joueur.
   */
  function createState(climateSensitivity) {
    const state = {
      lambda: F2X / (climateSensitivity || DEFAULT_LEVERS.climateSensitivity), // rétroaction climatique (W/m²/°C)
      year: START_YEAR - 1,
      pools: [0, 0, 0, 0], // carbone en excès dans l'air, par réservoir (GtC)
      tSurface: 0,
      tDeep: 0,
      methaneForcing: 0,
      permafrostTarget: 0,
      permafrostReleased: 0, // GtC
      cumulativeEmittedGtC: 0,
      seaLevel: 0, // mm, compté depuis 2025
      peakSinceToday: 0,
      tPresent: 0,
      co2ForcingPresent: 1,
      years: [],
    };
    for (let year = START_YEAR; year <= PRESENT_YEAR; year++) stepYear(state, null, 0);
    return state;
  }

  /** Copie indépendante d'un état (pour faire une prévision sans toucher au vrai monde). */
  function cloneState(state) {
    return { ...state, pools: state.pools.slice(), years: state.years.slice() };
  }

  /**
   * Fait avancer le climat d'un an.
   * detail : émissions de l'année (futureEmissions ou emissionsAt), ou null pour une année historique.
   * geoForcing : forçage de la géo-ingénierie solaire (W/m², négatif = refroidit).
   */
  function stepYear(state, detail, geoForcing) {
    const year = state.year + 1;
    state.year = year;
    const historical = year <= PRESENT_YEAR;
    const pools = state.pools;
    let co2Emitted; // Gt CO2 nets cette année
    let permafrostEmission = 0;

    if (historical) {
      co2Emitted = historicalEmissions(year);
    } else {
      // Le pergélisol libère du carbone quand la température dépasse celle de 2025,
      // et ce carbone ne revient pas, même si on refroidit ensuite.
      state.permafrostTarget = Math.max(
        state.permafrostTarget,
        PERMAFROST_GTC_PER_DEGREE * Math.max(0, state.tSurface - state.tPresent)
      );
      const release = Math.max(0, (state.permafrostTarget - state.permafrostReleased) / PERMAFROST_RELEASE_TIME);
      state.permafrostReleased += release;
      permafrostEmission = release * GTCO2_PER_GTC;
      co2Emitted = detail.fossil + detail.landUse - detail.removals + permafrostEmission;
    }

    // Cycle du carbone : chaque réservoir se vide à son rythme et reçoit sa part des émissions.
    const emittedGtC = co2Emitted / GTCO2_PER_GTC;
    const excessBefore = pools.reduce((a, b) => a + b, 0);
    const decay = poolDecay(sinkSlowdown(state.cumulativeEmittedGtC - excessBefore, state.tSurface));
    state.cumulativeEmittedGtC += emittedGtC;
    for (let i = 0; i < 4; i++) {
      pools[i] = pools[i] * decay[i] + CARBON_POOL_SHARES[i] * emittedGtC;
    }
    const excessGtC = pools.reduce((a, b) => a + b, 0);
    // On ne peut pas descendre sous le niveau préindustriel en retirant du CO2.
    const co2 = Math.max(PREINDUSTRIAL_CO2_PPM, PREINDUSTRIAL_CO2_PPM + excessGtC / GTC_PER_PPM);
    const co2Forcing = CO2_FORCING_COEFF * Math.log(co2 / PREINDUSTRIAL_CO2_PPM);

    // Forçages hors CO2
    let otherForcing;
    let aerosolForcing;
    if (historical) {
      // Avant 2025 : les gaz hors CO2 suivent le même rythme que le forçage du CO2 ;
      // les aérosols, qui ne restent que quelques jours dans l'air, suivent les émissions de l'année.
      const share = co2Forcing / CO2_FORCING_COEFF / Math.log(MEASURED_CO2_2025 / PREINDUSTRIAL_CO2_PPM);
      state.methaneForcing = METHANE_FORCING_2025 * share;
      otherForcing = OTHER_GHG_FORCING_2025 * share;
      aerosolForcing =
        (AEROSOL_FORCING_2025 * interpolate(HISTORY_FOSSIL_GTC, year)) /
        interpolate(HISTORY_FOSSIL_GTC, PRESENT_YEAR);
      geoForcing = 0;
    } else {
      // Le méthane disparaît de l'air en une douzaine d'années.
      const methaneTarget = METHANE_FORCING_2025 * detail.methane;
      state.methaneForcing += (methaneTarget - state.methaneForcing) / METHANE_LIFETIME;
      otherForcing = OTHER_GHG_FORCING_2025;
      aerosolForcing = AEROSOL_FORCING_2025 * detail.aerosols;
    }
    const forcing = co2Forcing + state.methaneForcing + otherForcing + aerosolForcing + geoForcing;

    // Modèle à deux couches : la surface se réchauffe vite, l'océan profond lentement.
    const flowToDeep = DEEP_OCEAN_EXCHANGE * (state.tSurface - state.tDeep);
    state.tSurface +=
      (forcing - state.lambda * state.tSurface - DEEP_OCEAN_EFFICACY * flowToDeep) / HEAT_CAPACITY_SURFACE;
    state.tDeep += flowToDeep / HEAT_CAPACITY_DEEP;

    if (year === PRESENT_YEAR) {
      state.tPresent = state.tSurface;
      state.co2ForcingPresent = co2Forcing;
    }
    if (!historical) {
      state.seaLevel += SEA_LEVEL_RATE * Math.max(0, state.tSurface + SEA_LEVEL_OFFSET);
      state.peakSinceToday = Math.max(state.peakSinceToday, state.tSurface);
    }

    const record = {
      year,
      historical,
      co2Emitted,
      co2,
      forcing,
      geoForcing,
      temperature: state.tSurface,
      seaLevel: historical ? 0 : state.seaLevel,
      seaIce: Math.min(7, Math.max(0, SEA_ICE_2025 - SEA_ICE_PER_DEGREE * (state.tSurface - state.tPresent))),
      ph: PH_PREINDUSTRIAL - PH_SLOPE * Math.log(co2 / PREINDUSTRIAL_CO2_PPM),
      permafrost: permafrostEmission,
      detail: historical ? null : detail,
    };
    state.years.push(record);
    return record;
  }

  /** Résumé des résultats : chiffres clés et points de bascule franchis. */
  function summarize(years, tPresent, peakSinceToday, co2ForcingPresent) {
    const last = years[years.length - 1];
    const future = years.filter((y) => !y.historical);
    const peak = Math.max(tPresent, peakSinceToday);
    const peakYear = future.reduce((a, b) => (b.temperature > a.temperature ? b : a), future[0]).year;
    const iceFree = future.find((y) => y.seaIce < SEA_ICE_FREE);
    const netZero = future.find((y) => y.co2Emitted <= 0);
    const cumulative = future.reduce((sum, y) => sum + y.co2Emitted, 0);

    return {
      years,
      present: years.find((y) => y.year === PRESENT_YEAR),
      final: last,
      peakTemperature: peak,
      peakYear: peak > tPresent ? peakYear : PRESENT_YEAR,
      iceFreeYear: iceFree ? iceFree.year : null,
      netZeroYear: netZero ? netZero.year : null,
      cumulativeEmissions: cumulative, // Gt CO2 émises de 2026 à 2100
      tippingPoints: TIPPING_POINTS.map((tp) => ({
        ...tp,
        crossed: peak >= tp.threshold,
      })),
      co2ForcingPresent,
    };
  }

  const api = {
    simulate,
    createState,
    cloneState,
    stepYear,
    summarize,
    futureEmissions,
    emissionsAt,
    ABSORBED_SUNLIGHT,
    geoengineeringForcing,
    rampProgress,
    interpolate,
    DEFAULT_LEVERS,
    TIPPING_POINTS,
    SECTOR_EMISSIONS_2025,
    PRESENT_YEAR,
    END_YEAR,
    START_YEAR,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ClimateModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
