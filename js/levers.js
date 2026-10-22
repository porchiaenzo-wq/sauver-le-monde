/*
 * Les leviers du jeu : ce que le joueur peut changer.
 * Chaque levier correspond à un paramètre de js/model.js et renvoie à ses sources (js/sources.js).
 *
 * realism : 'realiste' (déjà en cours), 'ambitieux' (possible mais très difficile),
 *           'extravagant' (théorique, jamais fait à grande échelle, risques mal connus).
 */
(function (root) {
  'use strict';

  const pct = (v) => `${Math.round(v * 100)} %`;
  const gt = (v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Gt CO₂/an`;
  const wm2 = (v) => `−${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} W/m²`;

  const LEVER_GROUPS = [
    {
      id: 'energy',
      title: 'Énergie',
      role: 'reduce',
      icon: 'bolt',
      intro: 'Les énergies fossiles produisent environ 90 % du CO₂ émis par l’homme.',
      levers: [
        {
          id: 'cleanPower',
          label: 'Électricité bas carbone',
          min: 0.4, max: 1, step: 0.05,
          format: pct,
          realism: 'ambitieux',
          description:
            'Part de l’électricité mondiale produite sans charbon ni gaz : solaire, éolien, hydraulique, nucléaire. Elle était de 41 % en 2024.',
          fact: 'Une électricité au charbon émet environ 100 fois plus de CO₂ par kWh que l’éolien ou le nucléaire, sur tout son cycle de vie.',
          sources: ['ember2025', 'unece2021', 'iea_nze'],
        },
        {
          id: 'electricTransport',
          label: 'Transports électriques',
          min: 0.02, max: 1, step: 0.05,
          format: pct,
          realism: 'ambitieux',
          description:
            'Part des transports (voitures, camions, bus) qui roulent à l’électricité. Elle ne sert vraiment que si l’électricité est bas carbone.',
          fact: 'Un moteur électrique utilise environ 3 fois moins d’énergie qu’un moteur à essence pour la même distance.',
          sources: ['iea_nze', 'ipcc_ar6_wg3'],
        },
        {
          id: 'heatPumps',
          label: 'Chauffage sans fioul ni gaz',
          min: 0, max: 1, step: 0.05,
          format: pct,
          realism: 'ambitieux',
          description: 'Part des chaudières au gaz et au fioul remplacées par des pompes à chaleur ou des réseaux de chaleur.',
          fact: 'Une pompe à chaleur fournit environ 3 kWh de chaleur pour 1 kWh d’électricité.',
          sources: ['iea_nze', 'ipcc_ar6_wg3'],
        },
        {
          id: 'cleanIndustry',
          label: 'Industrie propre',
          min: 0, max: 1, step: 0.05,
          format: pct,
          realism: 'ambitieux',
          description:
            'Acier à l’hydrogène, ciment bas carbone, captage du CO₂ des usines. L’industrie est le secteur le plus difficile à décarboner.',
          fact: 'Le ciment à lui seul émet environ 7 à 8 % du CO₂ mondial.',
          sources: ['ipcc_ar6_wg3', 'iea_nze'],
        },
        {
          id: 'energySaving',
          label: 'Sobriété et efficacité',
          min: 0, max: 0.5, step: 0.05,
          format: pct,
          realism: 'ambitieux',
          description:
            'Baisse de la consommation d’énergie : isolation des bâtiments, moins de trajets en voiture et en avion, appareils plus efficaces.',
          fact: 'Selon le GIEC, agir sur la demande pourrait réduire de 40 à 70 % les émissions de certains secteurs d’ici 2050.',
          sources: ['ipcc_ar6_wg3'],
        },
      ],
    },
    {
      id: 'land',
      title: 'Terres et alimentation',
      role: 'reduce',
      icon: 'leaf',
      intro: 'Forêts, agriculture et élevage : environ un quart des gaz à effet de serre.',
      levers: [
        {
          id: 'stopDeforestation',
          label: 'Arrêt de la déforestation',
          min: 0, max: 1, step: 0.05,
          format: pct,
          realism: 'ambitieux',
          description: 'Part de la déforestation stoppée (Amazonie, Indonésie, bassin du Congo).',
          fact: 'La déforestation émet environ 4 Gt de CO₂ par an, plus que l’Union européenne entière.',
          sources: ['gcb2025', 'ipcc_ar6_wg3'],
        },
        {
          id: 'plantDiet',
          label: 'Alimentation plus végétale',
          min: 0, max: 1, step: 0.05,
          format: pct,
          realism: 'ambitieux',
          description:
            'Baisse de la consommation de viande et de produits laitiers. Moins de méthane des vaches et moins de forêts rasées pour les pâturages.',
          fact: 'Une alimentation sans produits animaux divise presque par deux les émissions de l’alimentation.',
          sources: ['poore2018', 'unep_methane2021'],
        },
        {
          id: 'methaneCut',
          label: 'Fuites de méthane et déchets',
          min: 0, max: 1, step: 0.05,
          format: pct,
          realism: 'realiste',
          description:
            'Réparer les fuites des puits et gazoducs, capter le gaz des décharges. Le méthane réchauffe environ 80 fois plus que le CO₂ sur 20 ans, mais disparaît en une douzaine d’années : c’est le levier le plus rapide.',
          fact: 'Environ 70 % du méthane émis par le secteur de l’énergie peut être évité avec les techniques actuelles, souvent sans perte d’argent (le gaz récupéré se vend).',
          sources: ['unep_methane2021', 'iea_methane'],
        },
        {
          id: 'reforestation',
          label: 'Reboisement',
          min: 0, max: 10, step: 0.5,
          format: (v) => `${gt(v)} (≈ ${Math.round((v / 10) * 680)} millions d’ha)`,
          realism: 'ambitieux',
          description:
            'Replanter des forêts là où elles existaient. Elles mettent des années à pousser : l’effet arrive 10 ans plus tard que les autres leviers.',
          fact: 'Le maximum réaliste est d’environ 10 Gt CO₂ par an, sur une surface grande comme l’Australie. Planter dans les savanes peut faire plus de mal que de bien.',
          sources: ['griscom2017', 'bastin2019', 'veldman2019'],
        },
      ],
    },
    {
      id: 'removal',
      title: 'Retirer le CO₂ de l’air',
      role: 'remove',
      icon: 'capture',
      intro: 'Pour faire baisser la concentration, il faut absorber plus de CO₂ qu’on n’en émet.',
      levers: [
        {
          id: 'rockWeathering',
          label: 'Roches broyées sur les champs',
          min: 0, max: 2, step: 0.1,
          format: gt,
          realism: 'ambitieux',
          description:
            'Épandre du basalte réduit en poudre : en s’altérant sous la pluie, il fixe le CO₂ sous forme de minéraux.',
          fact: 'Il faudrait extraire et broyer des milliards de tonnes de roche par an.',
          sources: ['beerling2020', 'fuss2018'],
        },
        {
          id: 'directCapture',
          label: 'Aspirateurs à CO₂',
          min: 0, max: 20, step: 0.5,
          format: gt,
          realism: 'extravagant',
          description:
            'Usines de captage direct du CO₂ dans l’air, puis stockage sous terre. Très gourmandes en énergie et chères (plusieurs centaines d’euros la tonne aujourd’hui).',
          fact: 'Aujourd’hui, toutes les usines du monde réunies captent environ 0,01 million de tonnes par an : des millions de fois moins que nos émissions.',
          sources: ['iea_dac', 'fuss2018', 'ipcc_ar6_wg3'],
        },
      ],
    },
    {
      id: 'geo',
      title: 'Géo-ingénierie solaire',
      role: 'mask',
      icon: 'sun',
      intro:
        'Renvoyer une partie du soleil vers l’espace. Rapide et puissant, mais ne retire pas le CO₂ (les océans continuent de s’acidifier) et comporte de grands risques.',
      levers: [
        {
          id: 'stratosphericAerosols',
          label: 'Voile de soufre dans la stratosphère',
          min: 0, max: 3, step: 0.1,
          format: wm2,
          realism: 'extravagant',
          description:
            'Des avions répandent des particules à 20 km d’altitude, comme le fait naturellement un grand volcan. L’éruption du Pinatubo (1991) a refroidi la Terre d’environ 0,5 °C pendant un an.',
          fact: 'Risques : pluies de mousson perturbées, couche d’ozone abîmée, ciel plus blanc, tensions entre pays.',
          sources: ['nasem2021', 'royalsociety2009'],
        },
        {
          id: 'cloudBrightening',
          label: 'Nuages marins plus blancs',
          min: 0, max: 1, step: 0.05,
          format: wm2,
          realism: 'extravagant',
          description:
            'Des navires pulvérisent de fines gouttes d’eau de mer pour rendre les nuages bas plus réfléchissants.',
          fact: 'L’effet est local et très incertain : les chercheurs ne savent pas encore s’il fonctionne à grande échelle.',
          sources: ['latham2008', 'nasem2021'],
        },
        {
          id: 'spaceSunshade',
          label: 'Pare-soleil spatial',
          min: 0, max: 0.02, step: 0.001,
          format: (v) => `${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % du soleil`,
          realism: 'extravagant',
          description:
            'Un nuage de milliers de milliards de petits disques placés à 1,5 million de km, entre la Terre et le Soleil.',
          fact: 'Bloquer 1,8 % du soleil compenserait un doublement du CO₂. Le lancement prendrait des décennies et coûterait des milliers de milliards.',
          sources: ['angel2006'],
        },
        {
          id: 'geoStartYear',
          label: 'Début de la géo-ingénierie',
          min: 2030, max: 2080, step: 1,
          format: (v) => `${v}`,
          realism: 'extravagant',
          description: 'Année où les mesures de géo-ingénierie solaire commencent (montée en puissance sur 10 ans).',
          sources: ['nasem2021'],
        },
      ],
    },
  ];

  /** Réglages communs à tous les leviers. */
  const GLOBAL_LEVERS = [
    {
      id: 'targetYear',
      label: 'Année où les mesures atteignent leur plein effet',
      min: 2035, max: 2080, step: 1,
      format: (v) => `${v}`,
      description: 'Les changements se font progressivement, de 2026 jusqu’à cette année.',
      sources: ['ipcc_sr15'],
    },
    {
      id: 'climateSensitivity',
      label: 'Sensibilité du climat (incertitude scientifique)',
      min: 2, max: 5, step: 0.1,
      format: (v) => `${v.toLocaleString('fr-FR')} °C par doublement du CO₂`,
      description:
        'Réchauffement final si l’on double le CO₂. Meilleure estimation : 3 °C ; fourchette probable : 2,5 à 4 °C. Change-la pour voir l’effet de l’incertitude.',
      sources: ['sherwood2020', 'ipcc_ar6_wg1'],
    },
  ];

  /** Scénarios prêts à l’emploi. */
  const PRESETS = [
    {
      id: 'current',
      name: 'On ne change rien',
      description: 'Émissions qui restent au niveau de 2025. Proche des « politiques actuelles » du PNUE (≈ 2,8 °C).',
      levers: {},
    },
    {
      id: 'paris',
      name: 'Accord de Paris',
      description: 'Une transition rapide et mondiale vers 2050, sans géo-ingénierie.',
      levers: {
        cleanPower: 0.95, electricTransport: 0.85, heatPumps: 0.8, cleanIndustry: 0.75,
        energySaving: 0.2, stopDeforestation: 1, plantDiet: 0.3, methaneCut: 0.8,
        reforestation: 2, rockWeathering: 0.5, directCapture: 3,
      },
    },
    {
      id: 'everything',
      name: 'Tout, tout de suite',
      description: 'Tous les leviers « sur Terre » au maximum, dès 2040. Extrêmement difficile.',
      levers: {
        targetYear: 2040, cleanPower: 1, electricTransport: 1, heatPumps: 1, cleanIndustry: 1,
        energySaving: 0.4, stopDeforestation: 1, plantDiet: 0.7, methaneCut: 1,
        reforestation: 8, rockWeathering: 2, directCapture: 10,
      },
    },
    {
      id: 'geoOnly',
      name: 'Juste de la géo-ingénierie',
      description: 'On continue d’émettre, mais on bloque une partie du soleil dès 2035.',
      levers: { stratosphericAerosols: 2, geoStartYear: 2035 },
    },
    {
      id: 'termination',
      name: 'Le choc de terminaison',
      description: 'Géo-ingénierie seule, puis arrêt brutal en 2070 (guerre, crise…). Regarde la courbe.',
      levers: { stratosphericAerosols: 2, geoStartYear: 2035, geoStopYear: 2070 },
    },
  ];

  /** Les trois façons d'agir sur le climat. */
  const LEVER_ROLES = {
    reduce: { label: 'Réduire', hint: 'émettre moins de gaz à effet de serre' },
    remove: { label: 'Retirer', hint: 'enlever du CO₂ déjà dans l’air' },
    mask: { label: 'Masquer', hint: 'cacher le réchauffement sans enlever le CO₂' },
  };

  const REALISM_LABELS = {
    realiste: 'Réaliste',
    ambitieux: 'Ambitieux',
    extravagant: 'Extravagant',
  };

  const api = { LEVER_GROUPS, GLOBAL_LEVERS, PRESETS, REALISM_LABELS, LEVER_ROLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
