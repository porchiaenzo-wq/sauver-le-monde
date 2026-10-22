/*
 * Données du jeu « Campagne » : missions, niveaux de difficulté, améliorations, événements.
 *
 * Ce qui vient des sources : l'effet climatique de chaque mesure (js/model.js) et son coût
 * d'entretien par an (js/costs.js). Ce qui est un choix de jeu : les prix de lancement des niveaux,
 * la jauge de résistance, les bulles de fonds et les événements (inspirés de faits réels).
 */
(function (root) {
  'use strict';

  /** Les deux missions. secondsPerYear : durée d'une année à vitesse ×1 (équilibrage par tests). */
  const PERIODS = {
    2050: {
      id: '2050', endYear: 2050, secondsPerYear: 8, title: 'Mission 2050',
      pitch: '25 ans pour faire chuter les émissions. Une partie courte et nerveuse.',
      // Bulles par année de jeu (environ une toutes les 3 secondes à vitesse ×1)
      fundBubblesPerYear: 2.6, supportBubblesPerYear: 0.6,
    },
    2100: {
      id: '2100', endYear: 2100, secondsPerYear: 4, title: 'Mission 2100',
      pitch: '75 ans pour limiter le réchauffement. Une partie longue, où les erreurs se paient tard.',
      fundBubblesPerYear: 1.3, supportBubblesPerYear: 0.3,
    },
  };

  /*
   * Difficulté = objectif. Pour 2050, on juge les émissions nettes de CO2 (comme l'accord de Paris) ;
   * pour 2100, le réchauffement. Le reste (argent, résistance) suit la difficulté.
   */
  const DIFFICULTIES = {
    easy: {
      id: 'easy', name: 'Facile', startFunds: 1500, incomeFactor: 1.15, resistanceStart: 15, resistanceBase: 25,
      goals: { 2050: { type: 'emissions', reduction: 0.5 }, 2100: { type: 'temperature', max: 2.2 } },
    },
    normal: {
      id: 'normal', name: 'Normal', startFunds: 1000, incomeFactor: 1, resistanceStart: 20, resistanceBase: 35,
      goals: { 2050: { type: 'emissions', reduction: 0.8 }, 2100: { type: 'temperature', max: 1.7 } },
    },
    hard: {
      id: 'hard', name: 'Difficile', startFunds: 700, incomeFactor: 0.9, resistanceStart: 25, resistanceBase: 45,
      goals: { 2050: { type: 'emissions', reduction: 0.9 }, 2100: { type: 'temperature', max: 1.5 } },
    },
  };

  // Financement climat mondial en 2023 : environ 1 900 milliards de dollars par an [cpi2025].
  // Une moitié arrive d'elle-même chaque année, l'autre moitié par les bulles des pays.
  const CLIMATE_FINANCE_2023 = 1900;
  const PASSIVE_INCOME_SHARE = 0.5;
  const INCOME_GROWTH = 0.02; // par an, comme l'économie mondiale

  /*
   * Améliorations. Chaque niveau fixe la valeur visée du levier ; le déploiement prend du temps
   * (speed : part de la plage parcourue par an, ralentie par la résistance). Les vitesses sont réglées pour que
 * tout acheter très tôt mène à zéro émission nette vers 2050, le rythme le plus rapide jugé possible
 * par l'AIE [iea_nze].
   * price : prix de lancement de chaque niveau (milliards $) ; l'entretien annuel vient de js/costs.js.
   */
  const UPGRADES = [
    // --- Énergie (réduire) ---
    { id: 'cleanPower', group: 'energy', name: 'Électricité bas carbone', levels: [0.55, 0.7, 0.85, 1], price: [450, 750, 1050, 1500], speed: 0.035,
      steps: ['Parcs solaires et éoliens', 'Fermeture des centrales à charbon', 'Réseaux et stockage', '100 % bas carbone'] },
    { id: 'electricTransport', group: 'energy', name: 'Transports électriques', levels: [0.25, 0.5, 0.75, 1], price: [360, 450, 540, 660], speed: 0.03,
      steps: ['Bonus pour les voitures électriques', 'Bornes de recharge partout', 'Camions et bus électriques', 'Fin des moteurs thermiques'] },
    { id: 'heatPumps', group: 'energy', name: 'Chauffage sans fioul ni gaz', levels: [0.25, 0.5, 0.75, 1], price: [180, 240, 300, 360], speed: 0.03,
      steps: ['Aides aux pompes à chaleur', 'Réseaux de chaleur urbains', 'Interdiction des chaudières neuves au gaz', 'Tout le parc rénové'] },
    { id: 'cleanIndustry', group: 'energy', name: 'Industrie propre', levels: [0.25, 0.5, 0.75, 1], price: [600, 900, 1200, 1650], speed: 0.025,
      steps: ['Captage du CO₂ des cimenteries', 'Acier à l’hydrogène', 'Chimie électrifiée', 'Industrie neutre en carbone'] },
    { id: 'energySaving', group: 'energy', name: 'Sobriété et efficacité', levels: [0.1, 0.2, 0.35, 0.5], price: [300, 450, 750, 1050], speed: 0.02,
      steps: ['Isolation des logements', 'Moins de trajets en voiture et en avion', 'Appareils économes obligatoires', 'Société sobre'] },
    // --- Terres et alimentation (réduire) ---
    { id: 'stopDeforestation', group: 'land', name: 'Arrêt de la déforestation', levels: [0.33, 0.66, 1], price: [240, 360, 540], speed: 0.08,
      steps: ['Surveillance par satellite', 'Aires protégées', 'Zéro déforestation'] },
    { id: 'plantDiet', group: 'land', name: 'Alimentation plus végétale', levels: [0.25, 0.5, 0.75], price: [240, 420, 660], speed: 0.02,
      steps: ['Repas végétariens à la cantine', 'Moins de viande partout', 'Grand changement d’alimentation'] },
    { id: 'methaneCut', group: 'land', name: 'Fuites de méthane et déchets', levels: [0.33, 0.66, 1], price: [150, 240, 360], speed: 0.2,
      steps: ['Réparation des fuites de gaz', 'Captage du gaz des décharges', 'Zéro fuite'] },
    { id: 'reforestation', group: 'land', name: 'Reboisement', levels: [2, 5, 8, 10], price: [450, 750, 1050, 1350], speed: 0.03,
      steps: ['Grands programmes de plantation', 'Restauration des forêts tropicales', 'Ceinture verte mondiale', 'Maximum réaliste'] },
    // --- Retirer le CO2 ---
    { id: 'rockWeathering', group: 'removal', name: 'Roches broyées sur les champs', levels: [0.5, 1, 2], price: [450, 600, 900], speed: 0.04,
      steps: ['Essais sur les champs', 'Épandage à grande échelle', 'Maximum réaliste'] },
    { id: 'directCapture', group: 'removal', name: 'Aspirateurs à CO₂', levels: [1, 3, 6, 10, 20], price: [1200, 1800, 2700, 3900, 7500], speed: 0.03,
      steps: ['Premières grandes usines', 'Réseau mondial d’usines', 'Industrie du captage', 'Captage massif', 'Captage extravagant'] },
    // --- Géo-ingénierie (masquer) ---
    { id: 'stratosphericAerosols', group: 'geo', name: 'Voile de soufre dans la stratosphère', levels: [0.5, 1, 2, 3], price: [180, 240, 360, 480], speed: 0.35, resistance: 6,
      steps: ['Essais en altitude', 'Flotte d’avions spéciaux', 'Voile mondial', 'Voile épais'] },
    { id: 'cloudBrightening', group: 'geo', name: 'Nuages marins plus blancs', levels: [0.25, 0.5, 1], price: [240, 360, 540], speed: 0.3, resistance: 3,
      steps: ['Essais en mer', 'Flotte de navires', 'Océans entiers'] },
    { id: 'spaceSunshade', group: 'geo', name: 'Pare-soleil spatial', levels: [0.005, 0.01, 0.02], price: [1200, 1500, 2500], speed: 0.04, resistance: 2,
      steps: ['Premiers lancements', 'Nuage de disques', 'Pare-soleil géant'] },
    // --- Société (mécaniques de jeu) ---
    { id: 'education', group: 'society', name: 'Éducation au climat', levels: [1, 2, 3], price: [60, 100, 150],
      steps: ['Cours sur le climat à l’école', 'Grandes campagnes d’information', 'Culture du climat partout'],
      effect: 'Ralentit la montée de la résistance (−20 % par niveau).' },
    { id: 'justTransition', group: 'society', name: 'Transition juste', levels: [1, 2, 3], price: [100, 180, 260],
      steps: ['Aides aux travailleurs du charbon', 'Formation aux nouveaux métiers', 'Personne n’est laissé de côté'],
      effect: 'Les coûts des mesures irritent moins la population (−25 % par niveau).' },
    { id: 'diplomacy', group: 'society', name: 'Diplomatie climatique', levels: [1, 2, 3], price: [80, 150, 220],
      steps: ['Sommets réguliers', 'Fonds vert mondial', 'Alliance de tous les pays'],
      effect: 'Les pays versent plus d’argent (+10 % par niveau).' },
    { id: 'carbonTax', group: 'society', name: 'Taxe carbone', levels: [1, 2], price: [50, 100],
      steps: ['Prix du carbone modéré', 'Prix du carbone élevé'],
      effect: 'Rapporte de l’argent (+15 % par niveau) et accélère la transition (+10 %), mais irrite la population.' },
  ];

  const GROUPS = {
    energy: { name: 'Énergie', role: 'Réduire' },
    land: { name: 'Terres et alimentation', role: 'Réduire' },
    removal: { name: 'Retirer le CO₂', role: 'Retirer' },
    geo: { name: 'Géo-ingénierie', role: 'Masquer' },
    society: { name: 'Société', role: 'Soutenir' },
  };

  /*
   * Événements aléatoires (environ un tous les 3 ans), inspirés de faits réels.
   * effect : funds (milliards $), resistance (points), emissions (× sur l'année), geo (W/m² pour l'année),
   * income (× pendant duration ans), speed (× sur le déploiement pendant duration ans).
 * disaster : catastrophe climatique, plus fréquente quand il fait chaud.
   */
  const EVENTS = [
    { id: 'volcano', title: 'Éruption volcanique majeure', text: 'Comme le Pinatubo en 1991, ses cendres refroidissent la Terre quelques mois.', effect: { geo: -2 }, tone: 'neutral' },
    { id: 'oilShock', title: 'Choc pétrolier', text: 'Les prix de l’essence flambent : la population réclame des alternatives.', effect: { emissions: 0.97, resistance: -5 }, tone: 'good' },
    { id: 'heatwave', disaster: true, title: 'Canicule record', text: 'Des températures jamais vues : le climat devient la priorité.', effect: { resistance: -8 }, tone: 'good' },
    { id: 'wildfires', disaster: true, title: 'Méga-incendies', text: 'Des millions d’hectares brûlent. Il faut aider les victimes.', effect: { funds: -80, resistance: -5 }, tone: 'bad' },
    { id: 'floods', disaster: true, title: 'Inondations meurtrières', text: 'Des pluies extrêmes noient des villes entières.', effect: { funds: -100, resistance: -5 }, tone: 'bad' },
    { id: 'election', title: 'Élections : un grand pays freine', text: 'Le nouveau gouvernement réduit son aide au climat.', effect: { resistance: 10, income: 0.85, duration: 3 }, tone: 'bad' },
    { id: 'summit', title: 'Sommet climat réussi', text: 'Les pays s’engagent ensemble et débloquent des fonds.', effect: { funds: 250, resistance: -3 }, tone: 'good' },
    { id: 'batteries', title: 'Percée des batteries', text: 'Des batteries moins chères accélèrent l’électrification.', effect: { speed: 1.3, duration: 5 }, tone: 'good' },
    { id: 'fakeNews', title: 'Campagne de désinformation', text: 'De fausses informations sur le climat circulent partout.', effect: { resistance: 8 }, tone: 'bad' },
    { id: 'financialCrisis', title: 'Crise financière', text: 'Les marchés s’effondrent : l’argent se fait rare.', effect: { income: 0.8, duration: 2 }, tone: 'bad' },
    { id: 'youth', title: 'Marches pour le climat', text: 'Des millions de jeunes manifestent dans le monde.', effect: { resistance: -6 }, tone: 'good' },
    { id: 'shaleGas', title: 'Ruée sur le gaz de schiste', text: 'Un gaz bon marché redonne de la force au lobby fossile.', effect: { resistance: 6 }, tone: 'bad' },
  ];
  const EVENTS_PER_YEAR = 0.33;

  /** Poids des régions dans les fonds versés (taille des économies, ordre de grandeur). */
  const REGION_FUNDING = {
    northAmerica: 1.8, europe: 1.6, eastAsia: 1.7, russiaCentralAsia: 0.6, middleEast: 0.8, southAsia: 0.7,
    southeastAsia: 0.7, oceania: 0.6, southAmerica: 0.6, centralAmerica: 0.5, mediterranean: 0.7, africa: 0.4, arctic: 0,
    antarctica: 0,
  };

  const api = {
    PERIODS, DIFFICULTIES, UPGRADES, GROUPS, EVENTS, EVENTS_PER_YEAR, REGION_FUNDING,
    CLIMATE_FINANCE_2023, PASSIVE_INCOME_SHARE, INCOME_GROWTH,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameData = api;
})(typeof window !== 'undefined' ? window : globalThis);
