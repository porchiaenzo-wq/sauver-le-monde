/*
 * Moteur du jeu « Campagne » : tout ce qui se passe dans une partie, sans affichage.
 * L'interface (js/game-ui.js) appelle tick() plusieurs fois par seconde et affiche l'état.
 *
 * Une partie :
 *   - le temps avance mois par mois (secondsPerMonth par mois à vitesse ×1, ×2 ou ×4) ;
 *   - chaque mois, les mesures achetées se déploient un peu, on paie leur entretien, on reçoit des fonds,
 *     la résistance évolue et un événement peut survenir ;
 *   - chaque année (en janvier), le climat avance d'un an ;
 *   - des bulles apparaissent sur les pays : fonds (argent) ou soutien (fait baisser la résistance) ;
 *   - la résistance (lobbies, colère contre les coûts) monte : à 100 %, la partie est perdue ;
 *   - à la fin de la mission, on vérifie l'objectif.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Model = isNode ? require('./model.js') : root.ClimateModel;
  const Costs = isNode ? require('./costs.js') : root.Costs;
  const Data = isNode ? require('./game-data.js') : root.GameData;

  const START_YEAR = 2026;
  const EMISSIONS_2025 = 42.2; // Gt de CO2 nettes en 2025 (fossiles + déforestation) [gcb2025]
  const BUBBLE_LIFETIME = 7; // secondes réelles avant qu'une bulle disparaisse
  const SUPPORT_BUBBLE_RESISTANCE = 4; // points de résistance en moins par bulle de soutien
  const SPEEDS = [0, 1, 2, 4];
  const GOAL_AVERAGE_YEARS = 5;
  const RESISTANCE_PULL = 0.15; // part de l'écart rattrapée chaque année
  const MONTHLY_PULL = 1 - Math.pow(1 - RESISTANCE_PULL, 1 / 12);

  const LEVER_UPGRADES = Data.UPGRADES.filter((u) => u.group !== 'society');
  const BY_ID = Object.fromEntries(Data.UPGRADES.map((u) => [u.id, u]));

  /** Générateur de hasard reproductible (même graine = même partie), pour les tests. */
  function makeRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Création d'une partie
  // ---------------------------------------------------------------------------

  function createGame(options) {
    const period = Data.PERIODS[options.period];
    const difficulty = Data.DIFFICULTIES[options.difficulty];
    if (!period || !difficulty) throw new Error('Mission ou difficulté inconnue');
    const climate = Model.createState();
    const game = {
      // Climat « sans le masque » : le même monde, mais sans géo-ingénierie solaire.
      // C'est lui qui compte pour l'objectif de température (la géo-ingénierie cache, elle ne soigne pas).
      unmasked: Model.cloneState(climate),
      period,
      difficulty,
      goal: difficulty.goals[period.id],
      random: makeRandom(options.seed != null ? options.seed : Date.now()),
      regions: options.regions || Object.keys(Data.REGION_FUNDING).filter((r) => Data.REGION_FUNDING[r] > 0),
      time: START_YEAR, // date en années (2026,5 = juillet 2026), avance par mois
      month: 0, // nombre de mois écoulés depuis janvier 2026
      clock: 0, // secondes de jeu accumulées vers le mois suivant
      speed: 1,
      realTime: 0, // secondes réelles écoulées (pour la durée de vie des bulles)
      funds: difficulty.startFunds,
      resistance: difficulty.resistanceStart,
      resistanceTarget: difficulty.resistanceStart,
      levels: Object.fromEntries(Data.UPGRADES.map((u) => [u.id, 0])),
      deployed: { ...Model.DEFAULT_LEVERS }, // valeurs réellement en place
      climate,
      lastYear: climate.years[climate.years.length - 1],
      history: [],
      bubbles: [],
      nextBubbleId: 1,
      news: [],
      effects: [], // effets d'événements en cours : { income, speed, until }
      yearlyIncome: 0,
      yearlyUpkeep: 0,
      pendingEffect: {}, // effets d'événements sur les émissions ou le soleil, appliqués au calcul de l'année
      status: 'playing',
      result: null,
    };
    game.yearlyIncome = passiveIncome(game, START_YEAR);
    addNews(game, 'Début de la mission', `Nous sommes en ${START_YEAR}. Le monde compte sur toi.`, 'neutral');
    return game;
  }

  // ---------------------------------------------------------------------------
  // Valeurs dérivées
  // ---------------------------------------------------------------------------

  /** Année en cours, calculée sur le nombre entier de mois (pas d'erreur d'arrondi). */
  function currentYear(game) {
    return START_YEAR + Math.floor(game.month / 12);
  }

  /** Valeur visée d'un levier selon le niveau acheté. */
  function targetValue(game, id) {
    const level = game.levels[id];
    return level === 0 ? Model.DEFAULT_LEVERS[id] : BY_ID[id].levels[level - 1];
  }

  /** Multiplicateur en cours d'un type d'effet (income ou speed). */
  function activeFactor(game, key) {
    return game.effects.filter((e) => e[key] && e.until > game.time).reduce((f, e) => f * e[key], 1);
  }

  /** Revenus de l'année (milliards $), hors bulles. */
  function passiveIncome(game, year) {
    const growth = Math.pow(1 + Data.INCOME_GROWTH, year - START_YEAR);
    return Data.CLIMATE_FINANCE_2023 * Data.PASSIVE_INCOME_SHARE * incomeMultiplier(game) * growth;
  }

  function incomeMultiplier(game) {
    return (
      game.difficulty.incomeFactor *
      (1 + 0.1 * game.levels.diplomacy + 0.15 * game.levels.carbonTax) *
      activeFactor(game, 'income') *
      // Une population très hostile donne moins.
      (1 - 0.4 * (game.resistance / 100))
    );
  }

  /** Montant moyen d'une bulle de fonds, pour que les bulles rapportent l'autre moitié du financement. */
  function bubbleAmount(game, region, year) {
    const growth = Math.pow(1 + Data.INCOME_GROWTH, year - START_YEAR);
    const perYear = Data.CLIMATE_FINANCE_2023 * (1 - Data.PASSIVE_INCOME_SHARE) * growth;
    const weights = game.regions.map((r) => Data.REGION_FUNDING[r]);
    const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
    const base = (perYear / game.period.fundBubblesPerYear) * (Data.REGION_FUNDING[region] / mean);
    return Math.round(base * incomeMultiplier(game));
  }

  /**
   * Objectif : valeur mesurée (émissions de l'année, ou réchauffement moyen des 5 dernières années,
   * comme le font les scientifiques pour éviter qu'une éruption volcanique isolée fausse le résultat).
   */
  function goalStatus(game, climate, unmasked) {
    const years = climate.years;
    const record = years[years.length - 1];
    if (game.goal.type === 'emissions') {
      const reduction = 1 - record.co2Emitted / EMISSIONS_2025;
      return { value: reduction, reached: reduction >= game.goal.reduction - 1e-9 };
    }
    const last = (unmasked || climate).years.slice(-GOAL_AVERAGE_YEARS);
    const mean = last.reduce((s, y) => s + y.temperature, 0) / last.length;
    return { value: mean, reached: mean < game.goal.max };
  }

  function goalLabel(goal) {
    if (goal.type === 'emissions') {
      return goal.reduction >= 1
        ? 'Atteindre zéro émission nette de CO₂ en 2050'
        : `Réduire les émissions de CO₂ de ${Math.round(goal.reduction * 100)} % d’ici 2050`;
    }
    return `Rester sous ${goal.max.toLocaleString('fr-FR')} °C de réchauffement en 2100`;
  }

  /** Émissions et géo-ingénierie de l'année, à partir des mesures en place et des événements. */
  function yearInputs(game, deployed, eventEffect) {
    const detail = { ...Model.emissionsAt(deployed, 1, 1) };
    if (eventEffect && eventEffect.emissions) detail.fossil *= eventEffect.emissions;
    const natural = (eventEffect && eventEffect.geo) || 0; // éruption volcanique
    const geo =
      -(deployed.stratosphericAerosols + deployed.cloudBrightening + deployed.spaceSunshade * Model.ABSORBED_SUNLIGHT) +
      natural;
    return { detail, geo, natural };
  }

  /** Fait avancer le déploiement des mesures vers leur valeur visée (fraction d'année : 1/12 pour un mois). */
  function deploy(game, deployed, resistance, fraction = 1) {
    const slow =
      fraction * (1 - 0.5 * (resistance / 100)) * (1 + 0.1 * game.levels.carbonTax) * activeFactor(game, 'speed');
    for (const u of LEVER_UPGRADES) {
      const target = targetValue(game, u.id);
      const range = u.levels[u.levels.length - 1] - Model.DEFAULT_LEVERS[u.id];
      const step = u.speed * range * slow;
      const value = deployed[u.id];
      deployed[u.id] = target > value ? Math.min(target, value + step) : Math.max(target, value - step * 2);
    }
  }

  // ---------------------------------------------------------------------------
  // Une année
  // ---------------------------------------------------------------------------

  /** Un mois : déploiement, argent, résistance, événements et bulles. */
  function processMonth(game) {
    const year = START_YEAR + Math.floor(game.month / 12);

    deploy(game, game.deployed, game.resistance, 1 / 12);

    // Argent : revenus fixes moins entretien des mesures en place (montants annuels / 12)
    game.yearlyUpkeep = Math.max(0, Costs.computeCostsDeployed(game.deployed).total.central);
    game.yearlyIncome = passiveIncome(game, year);
    game.funds += (game.yearlyIncome - game.yearlyUpkeep) / 12;

    // Résistance : elle se rapproche d'un niveau fixé par la pression du moment.
    game.resistanceTarget = resistanceTarget(game, game.yearlyUpkeep, game.yearlyIncome, game.lastYear.temperature);
    game.resistance = clamp(game.resistance + (game.resistanceTarget - game.resistance) * MONTHLY_PULL, 0, 100);

    if (game.random() < Data.EVENTS_PER_YEAR / 12) {
      const event = pickEvent(game);
      applyEvent(game, event);
      // Les effets sur les émissions et le soleil comptent dans le calcul du climat de l'année.
      if (event.effect.emissions) game.pendingEffect.emissions = (game.pendingEffect.emissions || 1) * event.effect.emissions;
      if (event.effect.geo) game.pendingEffect.geo = (game.pendingEffect.geo || 0) + event.effect.geo;
    }
    spawnBubbles(game, 1 / 12);

    if (game.resistance >= 100) {
      finish(game, false, 'La résistance a gagné : les pays abandonnent la transition.');
      return;
    }

    game.month += 1;
    game.time = START_YEAR + game.month / 12;
    // Fin décembre : le climat avance d'un an.
    if (game.month % 12 === 0) processYear(game, year);
  }

  /** Une année : le climat avance d'un an avec les mesures en place. */
  function processYear(game, year) {
    const eventEffect = game.pendingEffect;
    game.pendingEffect = {};
    const { detail, geo, natural } = yearInputs(game, game.deployed, eventEffect);
    const record = Model.stepYear(game.climate, detail, geo);
    Model.stepYear(game.unmasked, detail, natural);
    game.lastYear = record;
    const upkeep = game.yearlyUpkeep;
    const income = game.yearlyIncome;

    game.history.push({
      year,
      temperature: record.temperature,
      unmaskedTemperature: game.unmasked.tSurface,
      emissions: record.co2Emitted,
      co2: record.co2,
      funds: game.funds,
      resistance: game.resistance,
      upkeep,
      income,
    });

    // Seuils marquants
    const previous = game.history[game.history.length - 2];
    for (const threshold of [1.5, 2, 2.5, 3]) {
      if (previous && previous.temperature < threshold && record.temperature >= threshold) {
        addNews(game, `Seuil de ${threshold.toLocaleString('fr-FR')} °C dépassé`, 'Les dégâts s’aggravent dans de nombreuses régions.', 'bad');
      }
    }
    if (previous && previous.emissions > 0 && record.co2Emitted <= 0) {
      addNews(game, 'Zéro émission nette !', 'Le monde absorbe désormais autant de CO₂ qu’il en émet.', 'good');
    }

    if (year >= game.period.endYear) {
      const status = goalStatus(game, game.climate, game.unmasked);
      return finish(game, status.reached, status.reached ? 'Objectif atteint !' : 'Objectif manqué.');
    }
  }

  /**
   * Niveau vers lequel tend la résistance :
   * base de la difficulté + poids des coûts (part du financement qui part en entretien)
   * + géo-ingénierie et taxe carbone, − éducation, − réchauffement visible (la population réclame des actes),
   * + dettes.
   */
  function resistanceTarget(game, upkeep, income, temperature) {
    return resistanceParts(game, upkeep, income, temperature).reduce((s, p) => s + p.value, 0);
  }

  /** Détail de la résistance visée, pour l'expliquer au joueur. */
  function resistanceParts(game, upkeep, income, temperature) {
    const geoLevels = LEVER_UPGRADES.filter((u) => u.resistance).reduce((s, u) => s + game.levels[u.id] * u.resistance, 0);
    const totalFinance = income * 2; // revenus fixes + bulles (l'autre moitié)
    const burden = upkeep / totalFinance;
    return [
      { id: 'base', label: 'Lobbies et habitudes', value: game.difficulty.resistanceBase },
      { id: 'costs', label: 'Coût des mesures', value: 45 * burden * (1 - 0.25 * game.levels.justTransition) },
      { id: 'geo', label: 'Peur de la géo-ingénierie', value: geoLevels },
      { id: 'tax', label: 'Taxe carbone', value: 10 * game.levels.carbonTax },
      { id: 'education', label: 'Éducation au climat', value: -10 * game.levels.education },
      { id: 'warming', label: 'Réchauffement visible', value: -12 * Math.max(0, temperature - 1.4) },
      { id: 'debt', label: 'Dettes', value: game.funds < 0 ? 30 : 0 },
    ].filter((p) => Math.abs(p.value) >= 0.5);
  }

  /** Détail de la résistance pour l'année en cours. */
  function currentResistanceParts(game) {
    return resistanceParts(game, game.yearlyUpkeep, game.yearlyIncome || passiveIncome(game, currentYear(game)), game.lastYear.temperature);
  }

  /**
   * Tire un événement. Les catastrophes climatiques sont plus fréquentes quand il fait plus chaud
   * (c'est là que la géo-ingénierie aide pendant la partie : elle garde la Terre plus fraîche).
   */
  function pickEvent(game) {
    const t = game.lastYear.temperature;
    const weights = Data.EVENTS.map((e) => (e.disaster ? Math.max(0.2, 2 * (t - 1.2)) : 1));
    let draw = game.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < Data.EVENTS.length; i++) {
      draw -= weights[i];
      if (draw <= 0) return Data.EVENTS[i];
    }
    return Data.EVENTS[Data.EVENTS.length - 1];
  }

  function applyEvent(game, event) {
    const e = event.effect;
    if (e.funds) game.funds += e.funds;
    if (e.resistance) game.resistance = clamp(game.resistance + e.resistance, 0, 100);
    if (e.income || e.speed) {
      game.effects.push({ income: e.income, speed: e.speed, until: game.time + (e.duration || 1) });
    }
    addNews(game, event.title, event.text, event.tone);
  }

  function finish(game, won, message) {
    game.status = won ? 'won' : 'lost';
    const record = game.lastYear;
    const status = goalStatus(game, game.climate, game.unmasked);
    let stars = 0;
    if (won) {
      stars = 1;
      if (game.resistance < 50) stars += 1;
      // 3e étoile : objectif dépassé avec de la marge (10 points d'émissions, ou 0,2 °C)
      const margin =
        game.goal.type === 'emissions' ? status.value >= game.goal.reduction + 0.1 : status.value <= game.goal.max - 0.2;
      if (margin) stars += 1;
    }
    game.result = {
      won, message, stars, value: status.value, year: record.year,
      temperature: record.temperature, unmaskedTemperature: game.unmasked.tSurface, emissions: record.co2Emitted,
    };
    game.bubbles = [];
  }

  // ---------------------------------------------------------------------------
  // Le temps qui passe
  // ---------------------------------------------------------------------------

  /** Avance la partie de realSeconds secondes réelles : le temps saute de mois en mois. */
  function tick(game, realSeconds) {
    if (game.status !== 'playing' || game.speed === 0) return 0;
    game.realTime += realSeconds;
    game.clock += realSeconds * game.speed;
    const spm = game.period.secondsPerMonth;
    let months = 0;
    // (le petit 1e-9 évite qu'une erreur d'arrondi fasse rater un mois)
    while (game.clock + 1e-9 >= spm && game.status === 'playing') {
      game.clock -= spm;
      processMonth(game);
      months += 1;
    }
    game.bubbles = game.bubbles.filter((b) => b.expires > game.realTime);
    return months;
  }

  function spawnBubbles(game, years) {
    const kinds = [
      ['funds', game.period.fundBubblesPerYear],
      ['support', game.period.supportBubblesPerYear],
    ];
    for (const [kind, rate] of kinds) {
      // Tirage de Poisson simplifié : probabilité rate × durée.
      if (game.random() < rate * years) {
        const region = game.regions[Math.floor(game.random() * game.regions.length)];
        game.bubbles.push({
          id: game.nextBubbleId++,
          kind,
          region,
          spot: game.random(), // position dans la région (choisie par l'interface)
          amount: kind === 'funds' ? bubbleAmount(game, region, currentYear(game)) : SUPPORT_BUBBLE_RESISTANCE,
          expires: game.realTime + BUBBLE_LIFETIME,
        });
      }
    }
  }

  /** Le joueur clique sur une bulle. */
  function collectBubble(game, bubbleId) {
    const bubble = game.bubbles.find((b) => b.id === bubbleId);
    if (!bubble || game.status !== 'playing') return null;
    game.bubbles = game.bubbles.filter((b) => b.id !== bubbleId);
    if (bubble.kind === 'funds') game.funds += bubble.amount;
    else game.resistance = clamp(game.resistance - bubble.amount, 0, 100);
    return bubble;
  }

  // ---------------------------------------------------------------------------
  // Achats
  // ---------------------------------------------------------------------------

  function nextPrice(game, id) {
    const u = BY_ID[id];
    const level = game.levels[id];
    return level >= u.levels.length ? null : u.price[level];
  }

  /** Achète le niveau suivant d'une amélioration. */
  function buy(game, id) {
    const price = nextPrice(game, id);
    if (game.status !== 'playing') return { ok: false, reason: 'La partie est terminée.' };
    if (price == null) return { ok: false, reason: 'Niveau maximum atteint.' };
    if (game.funds < price) return { ok: false, reason: 'Pas assez d’argent.' };
    game.funds -= price;
    game.levels[id] += 1;
    return { ok: true, price };
  }

  /** Coût d'entretien par an une fois ce niveau entièrement déployé (estimation pour l'interface). */
  function upkeepAfter(game, id) {
    const u = BY_ID[id];
    if (u.group === 'society') return 0;
    const level = game.levels[id];
    if (level >= u.levels.length) return 0;
    const now = {};
    const next = {};
    for (const x of LEVER_UPGRADES) {
      now[x.id] = targetValue(game, x.id);
      next[x.id] = x.id === id ? u.levels[level] : now[x.id];
    }
    return Costs.computeCostsDeployed(next).total.central - Costs.computeCostsDeployed(now).total.central;
  }

  /**
   * Prévision : ce que donnerait la fin de mission si l'on gardait les mesures achetées
   * (déploiement au rythme actuel, sans nouveaux événements).
   */
  function forecast(game) {
    const climate = Model.cloneState(game.climate);
    const unmasked = Model.cloneState(game.unmasked);
    const deployed = { ...game.deployed };
    let record = game.lastYear;
    let unmaskedRecord = game.unmasked.years[game.unmasked.years.length - 1];
    for (let year = climate.year + 1; year <= game.period.endYear; year++) {
      deploy(game, deployed, game.resistance);
      const { detail, geo } = yearInputs(game, deployed, null);
      record = Model.stepYear(climate, detail, geo);
      unmaskedRecord = Model.stepYear(unmasked, detail, 0);
    }
    return {
      ...goalStatus(game, climate, unmasked),
      temperature: record.temperature,
      unmaskedTemperature: unmaskedRecord.temperature,
      emissions: record.co2Emitted,
    };
  }

  function setSpeed(game, speed) {
    if (SPEEDS.includes(speed)) game.speed = speed;
  }

  function addNews(game, title, text, tone) {
    game.news.unshift({ year: START_YEAR + Math.floor(game.month / 12), month: game.month, title, text, tone });
    game.news = game.news.slice(0, 30);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  const api = {
    createGame, tick, buy, collectBubble, forecast, setSpeed, nextPrice, upkeepAfter, targetValue, goalLabel, goalStatus,
    currentResistanceParts, passiveIncome,
    START_YEAR, EMISSIONS_2025, SPEEDS, BUBBLE_LIFETIME, secondsPerYear: (period) => period.secondsPerMonth * 12,
  };
  if (isNode) module.exports = api;
  else root.GameEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
