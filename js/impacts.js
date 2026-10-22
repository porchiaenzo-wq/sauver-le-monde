/*
 * Impacts par région : ce qui arrive à partir de quel réchauffement mondial.
 *
 * Chaque impact a un seuil (réchauffement mondial depuis 1850, en °C) à partir duquel
 * le risque devient élevé selon la littérature citée. Les seuils sont des ordres de grandeur.
 *
 * La couleur d'une région vient d'un score (choix de présentation, expliqué sur la page) :
 *   - chaque risque monte progressivement : il commence 0,5 °C avant son seuil
 *     et atteint son plein effet 1,5 °C après (comme les « braises » du GIEC) ;
 *   - chaque risque a une gravité (weight) : 3 = vies menacées ou dégâts irréversibles,
 *     2 = dégâts majeurs (eau, récoltes, nature, économie), 1 = dégâts en partie évitables en s'adaptant ;
 *   - les régions que le GIEC désigne comme les plus vulnérables (Afrique, Asie du Sud,
 *     Amérique centrale et du Sud, Arctique, petites îles) ont un facteur de vulnérabilité
 *     [ipcc_ar6_wg2] (résumé pour décideurs, B.2.4).
 */
(function (root) {
  'use strict';

  const REGION_IMPACTS = {
    arctic: {
      name: 'Arctique et Groenland',
      intro: 'L’Arctique se réchauffe près de 4 fois plus vite que la moyenne mondiale depuis 1979.',
      vulnerability: 1.2,
      impacts: [
        { threshold: 1.5, weight: 2, text: 'Banquise d’été qui disparaît presque certaines années', sources: ['ipcc_ar6_wg1', 'notz2016'] },
        { threshold: 1.5, weight: 3, text: 'Fonte accélérée du Groenland, avec un point de bascule possible', sources: ['armstrongmckay2022'] },
        { threshold: 1.5, weight: 2, text: 'Dégel du pergélisol : routes, maisons et pipelines abîmés', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 2, text: 'Ours polaires, phoques et peuples autochtones privés de banquise', sources: ['ipcc_ar6_wg2'] },
      ],
      sources: ['rantanen2022'],
    },
    northAmerica: {
      name: 'Amérique du Nord',
      intro: 'Chaleur, sécheresses et incendies à l’Ouest, ouragans plus puissants à l’Est.',
      vulnerability: 1,
      impacts: [
        { threshold: 1.5, weight: 2, text: 'Incendies géants et sécheresses dans l’Ouest (Californie, Canada)', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 2, text: 'Vagues de chaleur dangereuses beaucoup plus fréquentes', sources: ['ipcc_ar6_wg1'] },
        { threshold: 2, weight: 2, text: 'Ouragans plus intenses sur le golfe du Mexique et la côte Est', sources: ['ipcc_ar6_wg1'] },
        { threshold: 3, weight: 1, text: 'Pertes de récoltes dans les grandes plaines agricoles', sources: ['ipcc_ar6_wg2'] },
      ],
    },
    centralAmerica: {
      name: 'Amérique centrale et Caraïbes',
      intro: 'Des îles et des côtes exposées aux ouragans et à la montée des mers.',
      vulnerability: 1.2,
      impacts: [
        { threshold: 1.5, weight: 2, text: 'Récifs coralliens des Caraïbes en grande partie détruits', sources: ['ipcc_sr15'] },
        { threshold: 1.5, weight: 3, text: 'Montée des mers et submersions sur les petites îles', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 3, text: '« Couloir sec » : récoltes perdues, faim et départs forcés', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 2, text: 'Ouragans plus destructeurs', sources: ['ipcc_ar6_wg1'] },
      ],
    },
    southAmerica: {
      name: 'Amérique du Sud',
      intro: 'L’Amazonie, poumon de la planète, et les glaciers des Andes sont en jeu.',
      vulnerability: 1.2,
      impacts: [
        { threshold: 1.5, weight: 2, text: 'Glaciers des Andes qui fondent : moins d’eau pour les villes et les cultures', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 2, text: 'Sécheresses et incendies plus fréquents en Amazonie', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2.5, weight: 2, text: 'Pertes de récoltes et d’élevage', sources: ['ipcc_ar6_wg2'] },
        { threshold: 3.5, weight: 3, text: 'Une grande partie de l’Amazonie pourrait se transformer en savane', sources: ['armstrongmckay2022'] },
      ],
    },
    europe: {
      name: 'Europe',
      intro: 'Le GIEC y identifie quatre grands risques : chaleur, récoltes, manque d’eau, inondations.',
      vulnerability: 1,
      impacts: [
        { threshold: 1.5, weight: 2, text: 'Canicules plus fréquentes, avec des milliers de décès chaque été', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 2, text: 'Manque d’eau en été, surtout au sud et au centre', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 1, text: 'Pertes de récoltes lors des étés chauds et secs', sources: ['ipcc_ar6_wg2'] },
        { threshold: 3, weight: 2, text: 'Inondations et montée des mers : les limites de l’adaptation sont atteintes', sources: ['ipcc_ar6_wg2'] },
      ],
    },
    mediterranean: {
      name: 'Bassin méditerranéen',
      intro: 'Un « point chaud » du climat : la région se réchauffe plus vite que la moyenne mondiale.',
      vulnerability: 1,
      impacts: [
        { threshold: 1.5, weight: 2, text: 'Sécheresses et pénuries d’eau', sources: ['ipcc_ar6_wg2', 'cramer2018'] },
        { threshold: 1.5, weight: 2, text: 'Incendies de forêt plus étendus', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 2, text: 'Chaleur extrême dans les villes', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 2, text: 'Deltas et côtes basses menacés (delta du Nil, Venise)', sources: ['cramer2018'] },
      ],
    },
    africa: {
      name: 'Afrique subsaharienne',
      intro: 'Peu responsable des émissions, mais parmi les régions les plus touchées.',
      vulnerability: 1.2,
      impacts: [
        { threshold: 1.5, weight: 3, text: 'Chaleur dangereuse pour travailler dehors', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 3, text: 'Baisse des récoltes (maïs, sorgho) et malnutrition', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 3, text: 'Pénuries d’eau au Sahel et en Afrique australe', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 2, text: 'Pertes importantes d’espèces animales et végétales', sources: ['ipcc_ar6_wg2'] },
      ],
    },
    middleEast: {
      name: 'Moyen-Orient',
      intro: 'Déjà l’une des régions les plus chaudes et les plus sèches du monde.',
      vulnerability: 1,
      impacts: [
        { threshold: 1.5, weight: 3, text: 'Pénuries d’eau aggravées', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 2, text: 'Chaleur extrême plusieurs semaines par an', sources: ['ipcc_ar6_wg1'] },
        { threshold: 3, weight: 2, text: 'Pertes agricoles et dépendance aux importations de nourriture', sources: ['ipcc_ar6_wg2'] },
        { threshold: 4, weight: 3, text: 'Chaleur humide mortelle possible dans le golfe Persique, même à l’ombre', sources: ['paleltahir2016', 'raymond2020'] },
      ],
    },
    russiaCentralAsia: {
      name: 'Russie et Asie centrale',
      intro: 'Le dégel du sol gelé et la fonte des glaciers de montagne changent tout.',
      vulnerability: 1,
      impacts: [
        { threshold: 1.5, weight: 2, text: 'Dégel du pergélisol en Sibérie, qui libère du carbone', sources: ['armstrongmckay2022', 'ipcc_ar6_wg2'] },
        { threshold: 2, weight: 1, text: 'Grands incendies dans les forêts boréales', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 2, text: 'Glaciers d’Asie centrale qui fondent : moins d’eau pour l’irrigation', sources: ['ipcc_ar6_wg2'] },
      ],
    },
    southAsia: {
      name: 'Asie du Sud',
      intro: 'Près de deux milliards d’habitants, entre chaleur humide, mousson et glaciers de l’Himalaya.',
      vulnerability: 1.2,
      impacts: [
        { threshold: 1.5, weight: 2, text: 'Un tiers de la glace de l’Himalaya fondue d’ici 2100, même à 1,5 °C', sources: ['wester2019'] },
        { threshold: 2, weight: 3, text: 'Chaleur humide dangereuse pour le corps humain (Inde, Pakistan)', sources: ['raymond2020', 'ipcc_ar6_wg2'] },
        { threshold: 2, weight: 2, text: 'Moussons plus violentes et inondations', sources: ['ipcc_ar6_wg1'] },
        { threshold: 2, weight: 3, text: 'Deltas submergés (Bangladesh)', sources: ['ipcc_ar6_wg2'] },
      ],
    },
    eastAsia: {
      name: 'Asie de l’Est',
      intro: 'De très grandes villes côtières exposées à la chaleur et aux inondations.',
      vulnerability: 1,
      impacts: [
        { threshold: 1.5, weight: 1, text: 'Vagues de chaleur plus fréquentes', sources: ['ipcc_ar6_wg1'] },
        { threshold: 2, weight: 2, text: 'Pluies extrêmes et inondations', sources: ['ipcc_ar6_wg1'] },
        { threshold: 2, weight: 2, text: 'Montée des mers à Shanghai, Tokyo, Canton', sources: ['ipcc_ar6_wg2'] },
        { threshold: 3, weight: 1, text: 'Moins d’eau venue des glaciers du plateau tibétain', sources: ['wester2019'] },
      ],
    },
    southeastAsia: {
      name: 'Asie du Sud-Est',
      intro: 'Des deltas, des îles et les plus riches récifs coralliens du monde.',
      vulnerability: 1,
      impacts: [
        { threshold: 1.5, weight: 2, text: 'Récifs coralliens du « triangle de corail » en grande partie détruits', sources: ['ipcc_sr15'] },
        { threshold: 2, weight: 3, text: 'Deltas submergés (Mékong, Irrawaddy)', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 2, text: 'Typhons plus intenses', sources: ['ipcc_ar6_wg1'] },
        { threshold: 3, weight: 2, text: 'Baisse des récoltes de riz', sources: ['ipcc_ar6_wg2'] },
      ],
    },
    oceania: {
      name: 'Océanie',
      intro: 'Grande Barrière de corail, incendies australiens et îles du Pacifique.',
      vulnerability: 1.1,
      impacts: [
        { threshold: 1.5, weight: 2, text: 'Blanchissements répétés de la Grande Barrière de corail', sources: ['ipcc_sr15', 'ipcc_ar6_wg2'] },
        { threshold: 1.5, weight: 2, text: 'Incendies géants en Australie', sources: ['ipcc_ar6_wg2'] },
        { threshold: 1.5, weight: 3, text: 'Îles du Pacifique menacées par la montée des mers', sources: ['ipcc_ar6_wg2'] },
        { threshold: 2, weight: 1, text: 'Sécheresses plus longues', sources: ['ipcc_ar6_wg2'] },
      ],
    },
    antarctica: {
      name: 'Antarctique',
      intro: 'La plus grande réserve de glace du monde : de quoi monter les mers de plusieurs dizaines de mètres.',
      vulnerability: 1,
      impacts: [
        { threshold: 1.5, weight: 3, text: 'Calotte de l’Antarctique de l’Ouest : point de bascule possible', sources: ['armstrongmckay2022'] },
        { threshold: 2, weight: 2, text: 'Manchots empereurs privés de banquise pour se reproduire', sources: ['ipcc_ar6_wg2'] },
        { threshold: 3, weight: 3, text: 'Montée des mers de plusieurs mètres sur les siècles suivants', sources: ['ipcc_ar6_wg1'] },
      ],
    },
  };

  // Partout : fréquence des chaleurs extrêmes qui arrivaient une fois tous les 10 ans avant 1850
  // [ipcc_ar6_wg1] (résumé pour décideurs, figure SPM.6).
  const HOT_EXTREMES = [
    [0, 1],
    [1, 2.8],
    [1.5, 4.1],
    [2, 5.6],
    [4, 9.4],
  ];

  const LEVELS = [
    { id: 0, label: 'Faible', min: 0 },
    { id: 1, label: 'Modéré', min: 0.15 },
    { id: 2, label: 'Élevé', min: 0.35 },
    { id: 3, label: 'Très élevé', min: 0.6 },
    { id: 4, label: 'Extrême', min: 0.9 },
  ];

  // Un risque commence 0,5 °C avant son seuil et atteint son plein effet 1,5 °C après.
  const RAMP_BEFORE = 0.5;
  const RAMP_AFTER = 1.5;

  const GRAVITY_LABELS = { 1: 'en partie évitable en s’adaptant', 2: 'dégâts majeurs', 3: 'vies menacées ou dégâts irréversibles' };

  /** Fréquence des chaleurs extrêmes (« fois plus souvent qu'avant 1850 ») pour un réchauffement donné. */
  function hotExtremeFactor(temperature) {
    const t = Math.max(0, temperature);
    for (let i = 1; i < HOT_EXTREMES.length; i++) {
      const [t1, f1] = HOT_EXTREMES[i];
      if (t <= t1) {
        const [t0, f0] = HOT_EXTREMES[i - 1];
        return f0 + ((f1 - f0) * (t - t0)) / (t1 - t0);
      }
    }
    // Au-delà de 4 °C, on prolonge la dernière pente.
    const [t0, f0] = HOT_EXTREMES[HOT_EXTREMES.length - 2];
    const [t1, f1] = HOT_EXTREMES[HOT_EXTREMES.length - 1];
    return f1 + ((f1 - f0) * (t - t1)) / (t1 - t0);
  }

  /** Avancement d'un risque, de 0 (pas encore là) à 1 (plein effet). */
  function impactProgress(impact, temperature) {
    const start = impact.threshold - RAMP_BEFORE;
    return Math.min(1, Math.max(0, (temperature - start) / (RAMP_BEFORE + RAMP_AFTER)));
  }

  /** État lisible d'un risque. */
  function impactState(impact, temperature) {
    const p = impactProgress(impact, temperature);
    if (p === 0) return 'Évité';
    if (temperature < impact.threshold) return 'Commence';
    if (p < 1) return 'Risque élevé';
    return 'Risque très élevé';
  }

  /** Score d'une région : moyenne des risques pondérée par leur gravité, × vulnérabilité. */
  function regionScore(regionId, temperature) {
    const region = REGION_IMPACTS[regionId];
    let weighted = 0;
    let total = 0;
    for (const impact of region.impacts) {
      weighted += impact.weight * impactProgress(impact, temperature);
      total += impact.weight;
    }
    return (region.vulnerability * weighted) / total;
  }

  /** Niveau de risque d'une région (0 à 4) pour un réchauffement mondial donné. */
  function regionLevel(regionId, temperature) {
    const score = regionScore(regionId, temperature);
    let level = 0;
    for (const l of LEVELS) if (score >= l.min) level = l.id;
    return level;
  }

  const api = {
    REGION_IMPACTS, LEVELS, GRAVITY_LABELS, hotExtremeFactor, impactProgress, impactState, regionScore, regionLevel,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
