/*
 * Interface du jeu « Campagne » (jeu.html) : écrans de départ, carte, bulles, tableau de bord,
 * panneaux des mesures et du monde, fin de partie. Toute la logique est dans js/game-engine.js.
 */
(function () {
  'use strict';

  const E = window.GameEngine;
  const D = window.GameData;
  const MAP = window.WORLD_MAP;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);

  const fmt = (v, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (v) => Math.round(v).toLocaleString('fr-FR');
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  // Vitesse d'adoption des mesures selon les régions (affichage de la carte « Transition »)
  const REGION_ADOPTION = {
    europe: 1.25, northAmerica: 1.1, eastAsia: 1.15, oceania: 1.1, mediterranean: 1, southAmerica: 0.95, centralAmerica: 0.85,
    southeastAsia: 0.9, southAsia: 0.85, middleEast: 0.75, russiaCentralAsia: 0.75, africa: 0.8, arctic: 1, antarctica: 1,
  };
  const TRANSITION_LEVELS = ['Rien encore', 'Débuts', 'En cours', 'Avancée', 'Presque finie'];

  let game = null;
  const choice = { period: null, difficulty: null };
  let view = 'transition';
  let speedBeforePause = null;
  let openPanel = null;
  let lastFrame = 0;
  let renderedMonth = null;
  let currentForecast = null;
  let lastNews = null;
  let endShown = false;
  let currentTab = 'energy';
  const bubbleEls = new Map();
  const regionPaths = {};
  const countriesByRegion = {};
  const leverInfo = Object.fromEntries(window.LEVER_GROUPS.flatMap((g) => g.levers).map((l) => [l.id, l]));
  const upgradeById = Object.fromEntries(D.UPGRADES.map((u) => [u.id, u]));

  // ---------------------------------------------------------------------------
  // Écrans de départ
  // ---------------------------------------------------------------------------

  function card(title, lines, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card';
    const h = document.createElement('span');
    h.className = 'card-title';
    h.textContent = title;
    button.appendChild(h);
    for (const [cls, text] of lines) {
      const p = document.createElement('span');
      p.className = cls;
      p.textContent = text;
      button.appendChild(p);
    }
    button.addEventListener('click', onClick);
    return button;
  }

  function showStep(step) {
    for (const id of ['setup-period', 'setup-difficulty', 'setup-briefing']) $(id).hidden = id !== step;
    const titles = { 'setup-period': 'Choisis ta mission', 'setup-difficulty': 'Choisis ton objectif', 'setup-briefing': 'Prêt ?' };
    $('setup-title').textContent = titles[step];
    const first = $(step).querySelector('button');
    if (first) first.focus();
  }

  function buildSetup() {
    $('period-cards').replaceChildren(
      ...Object.values(D.PERIODS).map((p) => {
        const years = p.endYear - E.START_YEAR + 1;
        const seconds = years * E.secondsPerYear(p);
        return card(p.title, [
          ['card-text', p.pitch],
          ['card-meta', `${years} ans, mois par mois · environ ${Math.round(seconds / 60)} minutes à vitesse normale (moins en ×2 ou ×4)`],
        ], () => {
          choice.period = p.id;
          buildDifficulties();
          showStep('setup-difficulty');
        });
      })
    );
    $('setup-back').addEventListener('click', () => showStep('setup-period'));
    $('setup-back2').addEventListener('click', () => showStep('setup-difficulty'));
    $('start').addEventListener('click', startGame);
  }

  function buildDifficulties() {
    $('difficulty-cards').replaceChildren(
      ...Object.values(D.DIFFICULTIES).map((d) =>
        card(d.name, [
          ['card-text', E.goalLabel(d.goals[choice.period])],
          ['card-meta', `Budget de départ : ${money(d.startFunds)} milliards $ · résistance de départ : ${d.resistanceStart} %`],
        ], () => {
          choice.difficulty = d.id;
          buildBriefing();
          showStep('setup-briefing');
        })
      )
    );
  }

  function buildBriefing() {
    const p = D.PERIODS[choice.period];
    const d = D.DIFFICULTIES[choice.difficulty];
    const box = $('briefing');
    box.replaceChildren();
    const goal = document.createElement('p');
    goal.className = 'briefing-goal';
    goal.textContent = `${p.title} · ${d.name} : ${E.goalLabel(d.goals[p.id])}.`;
    const list = document.createElement('ul');
    const tips = [
      `Tu commences en ${E.START_YEAR} avec ${money(d.startFunds)} milliards de dollars.`,
      'Clique sur les bulles vertes ($) qui apparaissent sur les pays : ce sont leurs dons pour le climat.',
      'Les bulles bleues (♥) sont des élans de soutien : elles font baisser la résistance.',
      'Ouvre « Mesures » pour investir. Chaque mesure coûte un prix de lancement, puis un entretien chaque année.',
      'Surveille la résistance (lobbies, colère contre les coûts) : à 100 %, la partie est perdue.',
      p.id === '2100'
        ? 'Attention : la géo-ingénierie cache le réchauffement mais ne compte pas pour l’objectif (elle masque, elle ne soigne pas).'
        : 'L’objectif porte sur les émissions de CO₂ de 2050 : la géo-ingénierie ne les fait pas baisser.',
      'Tu peux mettre en pause ou accélérer le temps (×2, ×4) en haut à droite. Barre d’espace : pause.',
    ];
    for (const tip of tips) {
      const li = document.createElement('li');
      li.textContent = tip;
      list.appendChild(li);
    }
    box.append(goal, list);
  }

  // ---------------------------------------------------------------------------
  // Carte
  // ---------------------------------------------------------------------------

  function buildMap() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${MAP.width} ${MAP.height}`);
    svg.setAttribute('class', 'map-svg');
    svg.setAttribute('aria-hidden', 'true');
    for (const [id, shape] of Object.entries(MAP.regions)) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', shape.d);
      path.setAttribute('class', 'map-region');
      svg.appendChild(path);
      regionPaths[id] = path;
    }
    const borders = document.createElementNS(SVG_NS, 'path');
    borders.setAttribute('d', MAP.borders);
    borders.setAttribute('class', 'map-borders');
    svg.appendChild(borders);
    $('game-map').replaceChildren(svg);
    for (const c of MAP.countries) (countriesByRegion[c.region] = countriesByRegion[c.region] || []).push(c);

    for (const button of document.querySelectorAll('.view-button')) {
      button.addEventListener('click', () => {
        view = button.dataset.view;
        for (const b of document.querySelectorAll('.view-button')) b.setAttribute('aria-pressed', String(b === button));
        renderMap();
      });
    }
  }

  /** Avancement de la transition (0 à 1) : part déployée des mesures qui réduisent ou retirent le CO2. */
  function transitionProgress() {
    const ups = D.UPGRADES.filter((u) => ['energy', 'land', 'removal'].includes(u.group));
    const shares = ups.map((u) => {
      const start = window.ClimateModel.DEFAULT_LEVERS[u.id];
      return (game.deployed[u.id] - start) / (u.levels[u.levels.length - 1] - start);
    });
    return shares.reduce((a, b) => a + b, 0) / shares.length;
  }

  function renderMap() {
    const t = game.lastYear.temperature;
    const progress = transitionProgress();
    for (const [id, path] of Object.entries(regionPaths)) {
      let level;
      if (view === 'transition') {
        const p = Math.min(1, progress * REGION_ADOPTION[id] * 1.6);
        level = p < 0.05 ? 0 : p < 0.25 ? 1 : p < 0.5 ? 2 : p < 0.8 ? 3 : 4;
        path.setAttribute('class', `map-region tr-${level}`);
      } else {
        level = window.regionLevel(id, t);
        path.setAttribute('class', `map-region risk-${level}`);
      }
    }
    const labels = view === 'transition' ? TRANSITION_LEVELS : window.LEVELS.map((l) => l.label);
    const prefix = view === 'transition' ? 'tr' : 'risk';
    $('map-legend').replaceChildren(
      ...labels.map((label, i) => {
        const li = document.createElement('li');
        const swatch = document.createElement('span');
        swatch.className = `swatch ${prefix}-${i}`;
        li.append(swatch, label);
        return li;
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Bulles
  // ---------------------------------------------------------------------------

  function bubblePosition(bubble) {
    const list = countriesByRegion[bubble.region];
    const country = list[Math.floor(bubble.spot * list.length) % list.length];
    // Petit décalage pour que deux bulles d'un même pays ne se superposent pas
    const dx = ((bubble.id * 37) % 21) - 10;
    const dy = ((bubble.id * 53) % 15) - 7;
    return { x: ((country.center[0] + dx) / MAP.width) * 100, y: ((country.center[1] + dy) / MAP.height) * 100 };
  }

  function renderBubbles() {
    const alive = new Set(game.bubbles.map((b) => b.id));
    for (const [id, el] of bubbleEls) {
      if (!alive.has(id)) {
        el.remove();
        bubbleEls.delete(id);
      }
    }
    for (const bubble of game.bubbles) {
      let el = bubbleEls.get(bubble.id);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = `bubble bubble-${bubble.kind}`;
        const pos = bubblePosition(bubble);
        el.style.left = `${pos.x}%`;
        el.style.top = `${pos.y}%`;
        const region = window.REGION_IMPACTS[bubble.region].name;
        el.textContent = bubble.kind === 'funds' ? '$' : '♥';
        el.setAttribute(
          'aria-label',
          bubble.kind === 'funds'
            ? `Don de la région ${region} : ${money(bubble.amount)} milliards de dollars`
            : `Soutien de la population (${region}) : résistance moins ${bubble.amount} %`
        );
        el.title = bubble.kind === 'funds' ? `${region} : +${money(bubble.amount)} Md$` : `${region} : soutien`;
        el.addEventListener('click', () => collect(bubble.id, pos));
        $('bubbles').appendChild(el);
        bubbleEls.set(bubble.id, el);
      }
      el.classList.toggle('fading', bubble.expires - game.realTime < 2);
    }
  }

  function collect(id, pos) {
    const bubble = E.collectBubble(game, id);
    if (!bubble) return;
    const floater = document.createElement('span');
    floater.className = `floater floater-${bubble.kind}`;
    floater.textContent = bubble.kind === 'funds' ? `+${money(bubble.amount)} Md$` : `−${bubble.amount} % résistance`;
    floater.style.left = `${pos.x}%`;
    floater.style.top = `${pos.y}%`;
    $('bubbles').appendChild(floater);
    setTimeout(() => floater.remove(), 1200);
    renderBubbles();
    renderHud();
  }

  // ---------------------------------------------------------------------------
  // Tableau de bord
  // ---------------------------------------------------------------------------

  function renderHud() {
    $('date').textContent = monthLabel(game.month);
    for (const b of document.querySelectorAll('.speed')) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === game.speed));

    $('funds').textContent = money(game.funds);
    $('funds').parentElement.classList.toggle('negative', game.funds < 0);
    const flow = game.yearlyIncome - game.yearlyUpkeep;
    $('funds-flow').textContent = game.yearlyIncome
      ? `${flow >= 0 ? '+' : '−'}${money(Math.abs(flow))} Md$/an hors bulles`
      : 'Ouvre les mesures pour investir';

    const record = game.lastYear;
    $('stat-temp').textContent = `${fmt(record.temperature)} °C`;
    const masked = game.unmasked.tSurface - record.temperature;
    $('stat-unmasked').textContent = masked > 0.05 ? `(${fmt(game.unmasked.tSurface)} °C sans le masque)` : '';
    $('stat-emissions').textContent = `${fmt(record.co2Emitted)} Gt/an`;
    const change = record.co2Emitted / E.EMISSIONS_2025 - 1;
    $('stat-emissions-change').textContent = `(${change <= 0 ? '−' : '+'}${Math.round(Math.abs(change) * 100)} % depuis 2025)`;
    $('stat-co2').textContent = `${Math.round(record.co2)} ppm`;

    $('resistance').textContent = Math.round(game.resistance);
    $('resistance-fill').style.width = `${game.resistance}%`;
    $('open-world').classList.toggle('danger', game.resistance >= 75);
    const trend = game.resistanceTarget - game.resistance;
    $('resistance-trend').textContent = Math.abs(trend) < 1 ? 'stable' : trend > 0 ? 'en hausse ▲' : 'en baisse ▼';

    renderGoal();
    renderNews();
  }

  function renderGoal() {
    const goal = game.goal;
    $('goal-label').textContent = E.goalLabel(goal);
    if (!currentForecast) return;
    const f = currentForecast;
    let progress;
    let text;
    if (goal.type === 'emissions') {
      const now = 1 - game.lastYear.co2Emitted / E.EMISSIONS_2025;
      progress = Math.max(0, Math.min(1, now / goal.reduction));
      text = `Prévision pour 2050 si tu en restes là : ${f.value >= 0 ? '−' : '+'}${Math.round(Math.abs(f.value) * 100)} % (objectif −${Math.round(goal.reduction * 100)} %)`;
    } else {
      // De 2,7 °C (sans rien faire) jusqu'à l'objectif
      progress = Math.max(0, Math.min(1, (2.7 - f.value) / (2.7 - goal.max)));
      text = `Prévision pour 2100 si tu en restes là : ${fmt(f.value)} °C sans le masque (objectif : moins de ${fmt(goal.max)} °C)`;
    }
    $('forecast').textContent = text;
    $('forecast').className = `hud-sub ${f.reached ? 'ok' : 'ko'}`;
    $('goal-progress').style.width = `${progress * 100}%`;
    $('goal-progress').className = f.reached ? 'ok' : '';
  }

  /**
   * Date lisible à partir du nombre de mois écoulés depuis janvier 2026 (nombre entier : pas d'erreur d'arrondi).
   * La mission s'arrête fin décembre de sa dernière année.
   */
  function monthLabel(month) {
    const last = (game.period.endYear - E.START_YEAR + 1) * 12 - 1;
    const m = Math.min(month, last);
    return `${MONTHS[m % 12]} ${E.START_YEAR + Math.floor(m / 12)}`;
  }

  function newsDate(n) {
    return monthLabel(n.month);
  }

  function renderNews() {
    const latest = game.news[0];
    if (latest === lastNews) return;
    lastNews = latest;
    const headline = $('news-headline');
    headline.textContent = `${newsDate(latest)} · ${latest.title} — ${latest.text}`;
    headline.className = `news-headline tone-${latest.tone}`;
    headline.classList.remove('flash');
    void headline.offsetWidth; // relance l'animation
    headline.classList.add('flash');
    $('news-log').replaceChildren(
      ...game.news.map((n) => {
        const li = document.createElement('li');
        li.className = `tone-${n.tone}`;
        li.textContent = `${newsDate(n)} · ${n.title} — ${n.text}`;
        return li;
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Panneaux (le jeu se met en pause pendant qu'ils sont ouverts)
  // ---------------------------------------------------------------------------

  function open(id) {
    if (openPanel) close();
    openPanel = id;
    speedBeforePause = game.speed;
    E.setSpeed(game, 0);
    $(id).hidden = false;
    if (id === 'measures') renderMeasures();
    if (id === 'world') renderWorld();
    $(id).querySelector('[data-close]').focus();
    renderHud();
  }

  function close() {
    if (!openPanel) return;
    $(openPanel).hidden = true;
    const opener = openPanel === 'measures' ? 'open-measures' : 'open-world';
    openPanel = null;
    if (game.status === 'playing') E.setSpeed(game, speedBeforePause || 1);
    $(opener).focus();
    renderMap();
    renderHud();
  }

  function renderMeasures() {
    $('measures-funds').textContent = `${money(game.funds)} milliards $`;
    $('measures-upkeep').textContent = `${money(game.yearlyUpkeep)} Md$/an`;
    $('measures-income').textContent = `${money(game.yearlyIncome || E.passiveIncome(game, Math.floor(game.time)))} Md$/an + bulles`;

    $('measure-tabs').replaceChildren(
      ...Object.entries(D.GROUPS).map(([id, g]) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `tab tab-${id}`;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(id === currentTab));
        const role = document.createElement('span');
        role.className = 'tab-role';
        role.textContent = g.role;
        tab.append(g.name, role);
        tab.addEventListener('click', () => {
          currentTab = id;
          renderMeasures();
        });
        return tab;
      })
    );

    $('measure-list').replaceChildren(...D.UPGRADES.filter((u) => u.group === currentTab).map(measureCard));
  }

  function measureCard(u) {
    const level = game.levels[u.id];
    const max = u.levels.length;
    const price = E.nextPrice(game, u.id);
    const box = document.createElement('article');
    box.className = `measure group-${u.group}`;

    const head = document.createElement('div');
    head.className = 'measure-head';
    const h = document.createElement('h3');
    h.textContent = u.name;
    const pips = document.createElement('span');
    pips.className = 'pips';
    pips.setAttribute('aria-label', `Niveau ${level} sur ${max}`);
    pips.textContent = '●'.repeat(level) + '○'.repeat(max - level);
    head.append(h, pips);
    box.appendChild(head);

    if (level > 0) {
      const now = document.createElement('p');
      now.className = 'measure-now';
      now.textContent = `En place : ${u.steps[level - 1]}`;
      if (u.group !== 'society') {
        const start = window.ClimateModel.DEFAULT_LEVERS[u.id];
        const target = E.targetValue(game, u.id);
        const share = target === start ? 1 : (game.deployed[u.id] - start) / (target - start);
        now.textContent += ` · déployé à ${Math.round(Math.max(0, Math.min(1, share)) * 100)} %`;
      }
      box.appendChild(now);
    }

    const next = document.createElement('p');
    next.className = 'measure-next';
    if (price == null) {
      next.textContent = 'Niveau maximum atteint.';
    } else {
      next.textContent = `Niveau ${level + 1} : ${u.steps[level]}`;
      const info = document.createElement('span');
      info.className = 'measure-info';
      if (u.group === 'society') {
        info.textContent = u.effect;
      } else {
        const upkeep = E.upkeepAfter(game, u.id);
        const lever = leverInfo[u.id];
        const value = lever ? lever.format(u.levels[level]) : '';
        info.textContent =
          `Objectif : ${value} · entretien ${upkeep >= 0 ? '+' : '−'}${money(Math.abs(upkeep))} Md$/an une fois déployé` +
          (u.resistance ? ` · fait monter la résistance (+${u.resistance} par niveau)` : '');
      }
      next.appendChild(info);
    }
    box.appendChild(next);

    if (leverInfo[u.id]) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'En savoir plus';
      const p = document.createElement('p');
      p.textContent = leverInfo[u.id].description;
      details.append(summary, p);
      box.appendChild(details);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy';
    if (price == null) {
      button.textContent = 'Terminé';
      button.disabled = true;
    } else {
      button.textContent = `Investir · ${money(price)} Md$`;
      button.disabled = game.funds < price;
      if (button.disabled) button.title = 'Pas assez d’argent : ramasse des bulles !';
      button.addEventListener('click', () => {
        if (E.buy(game, u.id).ok) {
          currentForecast = E.forecast(game);
          renderMeasures();
          renderHud();
        }
      });
    }
    box.appendChild(button);
    return box;
  }

  function renderWorld() {
    const temp = game.history.map((h) => [h.year, h.temperature]);
    const unmasked = game.history.map((h) => [h.year, h.unmaskedTemperature]);
    const series = [{ label: 'Réchauffement réel', color: '#ff8a5b', values: [[2025, 1.36], ...temp] }];
    if (unmasked.some((p, i) => p[1] - temp[i][1] > 0.05)) {
      series.push({ label: 'Sans le masque', color: '#c9a0ff', values: [[2025, 1.36], ...unmasked], dashed: true });
    }
    const refs = game.goal.type === 'temperature' ? [{ value: game.goal.max, label: 'objectif', color: '#7be0a5' }] : [];
    window.Charts.lineChart($('world-chart-temp'), {
      series, refLines: refs, xMin: 2025, xMax: game.period.endYear, yFormat: (v) => fmt(v), ariaLabel: 'Réchauffement depuis le début de la partie',
    });
    const goalEmissions = game.goal.type === 'emissions' ? E.EMISSIONS_2025 * (1 - game.goal.reduction) : null;
    window.Charts.lineChart($('world-chart-emissions'), {
      series: [{ label: 'Émissions nettes', color: '#5bc0ff', values: [[2025, E.EMISSIONS_2025], ...game.history.map((h) => [h.year, h.emissions])] }],
      refLines: [{ value: 0, label: 'zéro net' }, ...(goalEmissions != null ? [{ value: goalEmissions, label: 'objectif', color: '#7be0a5' }] : [])],
      xMin: 2025, xMax: game.period.endYear, yFormat: (v) => String(Math.round(v)), ariaLabel: 'Émissions depuis le début de la partie',
    });

    $('resistance-explain').textContent =
      `La résistance est à ${Math.round(game.resistance)} % et tend vers ${Math.round(game.resistanceTarget)} %. ` +
      'Elle ralentit le déploiement de tes mesures et réduit les dons. À 100 %, la partie est perdue.';
    $('resistance-factors').replaceChildren(
      ...E.currentResistanceParts(game).map((p) => {
        const li = document.createElement('li');
        li.className = p.value > 0 ? 'up' : 'down';
        li.textContent = `${p.label} : ${p.value > 0 ? '+' : '−'}${Math.round(Math.abs(p.value))}`;
        return li;
      })
    );

    const progress = transitionProgress();
    $('region-list').replaceChildren(
      ...Object.entries(window.REGION_IMPACTS).map(([id, r]) => {
        const li = document.createElement('li');
        const level = window.regionLevel(id, game.lastYear.temperature);
        const tr = Math.round(Math.min(1, progress * REGION_ADOPTION[id] * 1.6) * 100);
        const name = document.createElement('span');
        name.textContent = r.name;
        const info = document.createElement('span');
        info.className = `risk-chip risk-${level}`;
        info.textContent = window.LEVELS[level].label;
        const trs = document.createElement('span');
        trs.className = 'region-tr';
        trs.textContent = `transition ${tr} %`;
        li.append(name, trs, info);
        return li;
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Partie
  // ---------------------------------------------------------------------------

  function startGame() {
    game = E.createGame({ period: choice.period, difficulty: choice.difficulty, regions: undefined });
    for (const el of bubbleEls.values()) el.remove();
    bubbleEls.clear();
    renderedMonth = null;
    lastNews = null;
    endShown = false;
    currentForecast = E.forecast(game);
    $('setup').hidden = true;
    $('end').hidden = true;
    renderMap();
    renderHud();
    $('open-measures').focus();
  }

  function showEnd() {
    endShown = true;
    if (openPanel) close();
    const r = game.result;
    $('end-title').textContent = r.won ? 'Mission réussie !' : 'Mission échouée';
    $('end-stars').textContent = r.won ? '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) : '';
    $('end-stars').setAttribute('aria-label', r.won ? `${r.stars} étoile(s) sur 3` : '');
    $('end-message').textContent = r.message;
    const details = [
      game.goal.type === 'emissions'
        ? `Émissions en ${r.year} : ${fmt(r.emissions)} Gt de CO₂ (${r.value >= 0 ? '−' : '+'}${Math.round(Math.abs(r.value) * 100)} % depuis 2025, objectif −${Math.round(game.goal.reduction * 100)} %)`
        : `Réchauffement moyen des 5 dernières années, sans le masque : ${fmt(r.value)} °C (objectif : moins de ${fmt(game.goal.max)} °C)`,
      `Réchauffement en ${r.year} : ${fmt(r.temperature)} °C` + (r.unmaskedTemperature - r.temperature > 0.05 ? ` (${fmt(r.unmaskedTemperature)} °C sans la géo-ingénierie)` : ''),
      `Résistance finale : ${Math.round(game.resistance)} %`,
      `Fonds restants : ${money(game.funds)} milliards $`,
    ];
    if (r.won) details.push('★ objectif atteint · ★ résistance sous 50 % · ★ objectif dépassé avec de la marge');
    $('end-details').replaceChildren(
      ...details.map((d) => {
        const li = document.createElement('li');
        li.textContent = d;
        return li;
      })
    );
    window.Charts.lineChart($('end-chart'), {
      series: [{ label: 'Réchauffement réel', color: '#ff8a5b', values: [[2025, 1.36], ...game.history.map((h) => [h.year, h.temperature])] }],
      xMin: 2025, xMax: game.period.endYear, yFormat: (v) => fmt(v), ariaLabel: 'Réchauffement pendant la partie',
    });
    $('end').hidden = false;
    $('replay').focus();
  }

  function frame(timestamp) {
    const dt = Math.min(0.25, (timestamp - lastFrame) / 1000 || 0);
    lastFrame = timestamp;
    if (game && game.status === 'playing') {
      E.tick(game, dt);
      // Nouveau mois : la carte change ; nouvelle année : on recalcule la prévision.
      if (game.month !== renderedMonth) {
        if (renderedMonth == null || Math.floor(game.month / 12) !== Math.floor(renderedMonth / 12)) {
          currentForecast = E.forecast(game);
          if (openPanel === 'world') renderWorld();
        }
        renderedMonth = game.month;
        renderMap();
      }
      renderBubbles();
      renderHud();
    } else if (game && !endShown) {
      renderBubbles();
      renderHud();
      showEnd();
    }
    requestAnimationFrame(frame);
  }

  function setup() {
    buildSetup();
    buildMap();
    for (const b of document.querySelectorAll('.speed')) {
      b.addEventListener('click', () => {
        if (!game || openPanel) return;
        E.setSpeed(game, Number(b.dataset.speed));
        renderHud();
      });
    }
    $('open-measures').addEventListener('click', () => game && open('measures'));
    $('open-world').addEventListener('click', () => game && open('world'));
    for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', close);
    for (const id of ['measures', 'world']) {
      $(id).addEventListener('click', (e) => {
        if (e.target === $(id)) close();
      });
    }
    $('news-toggle').addEventListener('click', () => {
      const log = $('news-log');
      log.hidden = !log.hidden;
      $('news-toggle').setAttribute('aria-expanded', String(!log.hidden));
    });
    $('quit').addEventListener('click', () => {
      if (!game) return;
      E.setSpeed(game, 0);
      if (confirm('Quitter la partie en cours ?')) {
        game.status = 'quit';
        endShown = true;
        $('setup').hidden = false;
        showStep('setup-period');
      } else {
        E.setSpeed(game, 1);
      }
    });
    $('replay').addEventListener('click', startGame);
    $('new-mission').addEventListener('click', () => {
      $('end').hidden = true;
      $('setup').hidden = false;
      showStep('setup-period');
    });
    document.addEventListener('keydown', (e) => {
      if (!game || game.status !== 'playing') return;
      if (e.key === 'Escape' && openPanel) close();
      if (openPanel || e.target.closest('input, textarea')) return;
      if (e.key === ' ' && !e.target.closest('button')) {
        e.preventDefault();
        E.setSpeed(game, game.speed === 0 ? 1 : 0);
      }
    });
    // Pause automatique si l'onglet est caché.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game && game.status === 'playing' && !openPanel) E.setSpeed(game, 0);
    });
    showStep('setup-period');
    requestAnimationFrame(frame);
  }

  setup();
})();
