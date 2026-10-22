/*
 * Mode découverte : une visite pas à pas pour débutants.
 * Une carte en bas de l'écran explique chaque élément de la page puis chaque levier, un par un,
 * avec son effet calculé (seul et à fond) et un bouton pour l'essayer.
 * S'appuie sur window.App (js/app.js).
 */
(function () {
  'use strict';

  const { simulate, DEFAULT_LEVERS } = window.ClimateModel;
  const fmt = (v, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const $ = (id) => document.getElementById(id);
  // Même arrondi que le reste de la page : à la dizaine au-delà de 100 milliards.
  const billions = (v) => (Math.abs(v) >= 100 ? Math.round(v / 10) * 10 : Math.round(v)).toLocaleString('fr-FR');

  let steps = [];
  let index = 0;
  let active = false;
  let highlighted = null;
  let lastResult = null;
  let lastLevers = null;
  let lastCosts = null;
  const baseline = simulate({});

  // ---------------------------------------------------------------------------
  // Les étapes
  // ---------------------------------------------------------------------------

  /** Effet d'un levier utilisé seul, poussé à sa valeur maximale. */
  function leverEffect(lever) {
    const values = { [lever.id]: lever.max };
    const r = simulate(values);
    const cost = window.Costs.computeCosts(values, 2050).total.central;
    // Écart calculé sur les valeurs arrondies affichées, pour que le texte reste cohérent.
    const round = (v) => Math.round(v * 10) / 10;
    const delta = round(r.final.temperature) - round(baseline.final.temperature);
    let costText = '';
    if (Math.abs(cost) >= 1) {
      costText = cost < 0
        ? `, et fait économiser ≈ ${billions(-cost)} milliards $ par an`
        : `, pour ≈ ${billions(cost)} milliards $ par an en 2050`;
    }
    return `Utilisé seul et à fond, ce levier fait passer le réchauffement de 2100 de ${fmt(baseline.final.temperature)} à ${fmt(r.final.temperature)} °C (${delta <= 0 ? '−' : '+'}${fmt(Math.abs(delta))} °C)${costText}.`;
  }

  function buildSteps() {
    const leverSteps = window.LEVER_GROUPS.flatMap((group) =>
      group.levers
        .filter((l) => l.id !== 'geoStartYear')
        .map((lever, i) => ({
          target: () => $(`lever-${lever.id}`).closest('.lever'),
          title: lever.label,
          group: i === 0 ? group.title : null,
          groupIntro: i === 0 ? group.intro : null,
          text: () => lever.description,
          fact: lever.fact,
          effect: () => leverEffect(lever),
          lever,
        }))
    );

    return [
      {
        target: () => $('verdict'),
        title: 'Bienvenue !',
        text: () =>
          `Ce simulateur calcule le climat jusqu’en 2100 à partir des données du GIEC. Pour l’instant, personne ne fait rien : ` +
          `la Terre se réchaufferait d’environ ${fmt(baseline.final.temperature)} °C en 2100. On va découvrir ensemble, un par un, ` +
          `les leviers qui permettent de changer ça.`,
      },
      {
        target: () => $('chart-temperature').closest('figure'),
        title: 'La courbe à surveiller',
        text: () =>
          'Ce graphique montre le réchauffement depuis 1850. La partie après « aujourd’hui » dépend de tes choix. ' +
          'Les lignes 1,5 °C et 2 °C sont les objectifs de l’accord de Paris. Quand tu bouges un levier, une courbe en pointillés ' +
          'garde le scénario « sans rien faire » pour comparer.',
      },
      {
        target: () => $('stats'),
        title: 'Les chiffres clés',
        text: () =>
          'Ici, les conséquences de ton plan : réchauffement en 2100, pic de chaleur, montée des mers, banquise arctique, ' +
          'année où l’on n’émet plus de CO₂ en net, et acidité des océans.',
      },
      {
        target: () => $('lever-targetYear').closest('.lever'),
        title: 'Le rythme',
        text: () =>
          'Les changements ne se font pas en un jour. Ce réglage fixe l’année où toutes les mesures atteignent leur plein effet. ' +
          'Plus c’est tôt, mieux c’est pour le climat… mais plus c’est difficile. Garde 2050 pour commencer.',
      },
      ...leverSteps,
      {
        target: () => $('impacts'),
        title: 'La carte des impacts',
        text: () =>
          'Voici ce que ton plan change pour chaque région du monde. Touche une région pour voir ses risques, ' +
          'et bouge le curseur des années pour voir l’évolution.',
      },
      {
        target: () => $('costs-title').closest('section'),
        title: 'Combien ça coûte ?',
        text: () =>
          'Chaque mesure a un coût, d’après le GIEC. Certaines font même économiser de l’argent. ' +
          'Compare avec les dégâts évités : selon le GIEC, agir coûte moins cher que subir.',
      },
      {
        target: () => $('verdict'),
        title: 'Bravo, tu connais tous les leviers !',
        text: () =>
          lastResult
            ? `Avec tes choix, le réchauffement en 2100 serait de ${fmt(lastResult.final.temperature)} °C. ` +
              'Continue à jouer librement, ou essaie les défis chronométrés : il faudra atteindre un objectif avec un budget limité.'
            : '',
        final: true,
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Affichage
  // ---------------------------------------------------------------------------

  function start() {
    // On repart d'un monde « sans rien faire », en mode libre.
    $('mode-sandbox').click();
    window.App.setConstraints(null);
    steps = buildSteps();
    index = 0;
    active = true;
    $('mode-tour').setAttribute('aria-pressed', 'true');
    $('mode-sandbox').setAttribute('aria-pressed', 'false');
    $('tour').hidden = false;
    document.body.classList.add('tour-active');
    show();
  }

  function stop() {
    active = false;
    $('tour').hidden = true;
    document.body.classList.remove('tour-active');
    $('mode-tour').setAttribute('aria-pressed', 'false');
    $('mode-sandbox').setAttribute('aria-pressed', 'true');
    if (highlighted) highlighted.classList.remove('tour-highlight');
    highlighted = null;
  }

  function show() {
    const step = steps[index];
    if (highlighted) highlighted.classList.remove('tour-highlight');
    highlighted = step.target();
    highlighted.classList.add('tour-highlight');
    highlighted.scrollIntoView({ behavior: 'smooth', block: 'start' });

    $('tour-count').textContent = `Étape ${index + 1} sur ${steps.length}`;
    $('tour-progress').style.setProperty('--progress', `${((index + 1) / steps.length) * 100}%`);
    $('tour-group').textContent = step.group ? `${step.group} — ${step.groupIntro}` : '';
    $('tour-title').textContent = step.title;
    $('tour-text').textContent = step.text();
    $('tour-fact').textContent = step.fact || '';
    $('tour-effect').textContent = step.effect ? step.effect() : '';
    $('tour-prev').disabled = index === 0;
    $('tour-next').hidden = Boolean(step.final);
    $('tour-challenge').hidden = !step.final;
    $('tour-done').hidden = !step.final;
    updateTryButton();
    $('tour').scrollTop = 0;
    $('tour-title').focus({ preventScroll: true });
  }

  function updateTryButton() {
    const step = steps[index];
    const button = $('tour-try');
    if (!step || !step.lever || !lastLevers) {
      button.hidden = true;
      $('tour-live').textContent = '';
      return;
    }
    button.hidden = false;
    const isOn = lastLevers[step.lever.id] !== DEFAULT_LEVERS[step.lever.id];
    button.textContent = isOn ? 'Remettre à zéro' : 'Essayer ce levier';
    button.setAttribute('aria-pressed', String(isOn));
    $('tour-live').textContent = lastResult
      ? `Ton plan actuel : ${fmt(lastResult.final.temperature)} °C en 2100` +
        (lastCosts && Math.abs(lastCosts.total.central) >= 1
          ? `, ≈ ${billions(lastCosts.total.central)} milliards $ par an en 2050.`
          : '.')
      : '';
  }

  function toggleLever() {
    const lever = steps[index].lever;
    const isOn = lastLevers[lever.id] !== DEFAULT_LEVERS[lever.id];
    window.App.setLevers({ [lever.id]: isOn ? DEFAULT_LEVERS[lever.id] : lever.max });
  }

  function go(delta) {
    index = Math.max(0, Math.min(steps.length - 1, index + delta));
    show();
  }

  $('mode-tour').addEventListener('click', start);
  $('tour-next').addEventListener('click', () => go(1));
  $('tour-prev').addEventListener('click', () => go(-1));
  $('tour-quit').addEventListener('click', stop);
  $('tour-done').addEventListener('click', stop);
  $('tour-try').addEventListener('click', toggleLever);
  $('tour-challenge').addEventListener('click', () => {
    stop();
    $('mode-challenge').click();
    $('challenge-list').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // Les autres modes ferment la visite.
  for (const id of ['mode-sandbox', 'mode-challenge']) {
    $(id).addEventListener('click', () => {
      if (active) stop();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (active && e.key === 'Escape') stop();
  });

  window.App.onResult((result, levers, costs) => {
    lastResult = result;
    lastLevers = levers;
    lastCosts = costs;
    if (!active) return;
    updateTryButton();
    // Le texte de la dernière étape dépend du résultat.
    if (steps[index].final) $('tour-text').textContent = steps[index].text();
  });
})();
