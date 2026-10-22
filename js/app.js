/*
 * Interface : crée les curseurs, lance la simulation à chaque changement
 * et affiche les résultats (verdict, chiffres clés, graphiques, points de bascule, sources).
 */
(function () {
  'use strict';

  const { simulate, DEFAULT_LEVERS, PRESENT_YEAR, SECTOR_EMISSIONS_2025 } = window.ClimateModel;
  const GEO_STOP_YEAR = 2070;

  const fmt = (v, digits = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // État courant des leviers
  let levers = { ...DEFAULT_LEVERS };
  // Scénario de référence « on ne change rien », recalculé seulement si la sensibilité change.
  let baseline = null;
  let baselineSensitivity = null;
  // Contraintes du mode défi : { locked: {levier: valeur}, limits: {levier: max} }, ou null.
  let constraints = null;
  const resultListeners = [];
  let frozen = false; // curseurs bloqués (fin du chrono)

  const allLevers = [...window.GLOBAL_LEVERS, ...window.LEVER_GROUPS.flatMap((g) => g.levers)];
  const inputs = {};

  // ---------------------------------------------------------------------------
  // Construction des curseurs
  // ---------------------------------------------------------------------------

  function sourceLinks(ids) {
    const list = document.createElement('ul');
    list.className = 'source-links';
    for (const id of ids || []) {
      const src = window.SOURCES[id];
      if (!src) continue;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = src.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `${src.authors} (${src.year})`;
      li.append(a, ` : ${src.title}`);
      list.appendChild(li);
    }
    return list;
  }

  function buildLever(lever) {
    const wrapper = document.createElement('div');
    wrapper.className = 'lever';

    const head = document.createElement('div');
    head.className = 'lever-head';
    const label = document.createElement('label');
    label.htmlFor = `lever-${lever.id}`;
    label.textContent = lever.label;
    const value = document.createElement('output');
    value.htmlFor = `lever-${lever.id}`;
    value.className = 'lever-value';
    head.append(label, value);

    const input = document.createElement('input');
    input.type = 'range';
    input.id = `lever-${lever.id}`;
    input.min = lever.min;
    input.max = lever.max;
    input.step = lever.step;
    input.addEventListener('input', () => {
      levers[lever.id] = Number(input.value);
      clearPreset();
      scheduleUpdate();
    });

    wrapper.append(head, input);

    if (lever.realism) {
      const badge = document.createElement('span');
      badge.className = `badge badge-${lever.realism}`;
      badge.textContent = window.REALISM_LABELS[lever.realism];
      label.appendChild(badge);
    }

    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'En savoir plus';
    const desc = document.createElement('p');
    desc.textContent = lever.description;
    details.append(summary, desc);
    if (lever.fact) {
      const fact = document.createElement('p');
      fact.className = 'fact';
      fact.textContent = lever.fact;
      details.appendChild(fact);
    }
    details.appendChild(sourceLinks(lever.sources));
    wrapper.appendChild(details);

    inputs[lever.id] = { input, value, lever };
    return wrapper;
  }

  function buildLevers() {
    const globalBox = document.getElementById('global-levers');
    const title = document.createElement('h3');
    title.textContent = 'Rythme et incertitude';
    globalBox.appendChild(title);
    for (const lever of window.GLOBAL_LEVERS) globalBox.appendChild(buildLever(lever));

    const groupsBox = document.getElementById('lever-groups');
    for (const group of window.LEVER_GROUPS) {
      const box = document.createElement('div');
      box.className = `lever-group group-${group.id}`;
      const h = document.createElement('h3');
      h.textContent = group.title;
      const intro = document.createElement('p');
      intro.className = 'muted';
      intro.textContent = group.intro;
      box.append(h, intro);
      for (const lever of group.levers) box.appendChild(buildLever(lever));
      groupsBox.appendChild(box);
    }

    document.getElementById('geo-stop').addEventListener('change', (e) => {
      levers.geoStopYear = e.target.checked ? GEO_STOP_YEAR : null;
      clearPreset();
      scheduleUpdate();
    });
  }

  function syncInputs() {
    const locked = (constraints && constraints.locked) || {};
    const limits = (constraints && constraints.limits) || {};
    for (const { input, value, lever } of Object.values(inputs)) {
      const isLocked = lever.id in locked;
      const max = lever.id in limits ? Math.min(lever.max, limits[lever.id]) : lever.max;
      input.max = max;
      input.disabled = isLocked || frozen;
      input.value = levers[lever.id];
      let text = lever.format(Number(levers[lever.id]));
      if (isLocked) text += ' · bloqué';
      else if (max < lever.max) text += ` · max ${lever.format(max)}`;
      value.textContent = text;
    }
    const geoStop = document.getElementById('geo-stop');
    geoStop.checked = levers.geoStopYear != null;
    geoStop.disabled = frozen || 'stratosphericAerosols' in locked;
  }

  /** Valeurs de départ : par défaut, avec les leviers bloqués du défi en cours. */
  function startingLevers() {
    return { ...DEFAULT_LEVERS, ...((constraints && constraints.locked) || {}) };
  }

  // ---------------------------------------------------------------------------
  // Scénarios prêts à l'emploi
  // ---------------------------------------------------------------------------

  function buildPresets() {
    const box = document.getElementById('presets');
    for (const preset of window.PRESETS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button preset';
      button.dataset.preset = preset.id;
      button.textContent = preset.name;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => applyPreset(preset));
      box.appendChild(button);
    }
  }

  function applyPreset(preset) {
    levers = { ...DEFAULT_LEVERS, climateSensitivity: levers.climateSensitivity, ...preset.levers };
    for (const b of document.querySelectorAll('.preset')) {
      b.setAttribute('aria-pressed', String(b.dataset.preset === preset.id));
    }
    document.getElementById('preset-description').textContent = preset.description;
    scheduleUpdate();
  }

  function clearPreset() {
    for (const b of document.querySelectorAll('.preset')) b.setAttribute('aria-pressed', 'false');
    document.getElementById('preset-description').textContent = '';
  }

  // ---------------------------------------------------------------------------
  // Affichage des résultats
  // ---------------------------------------------------------------------------

  function verdictFor(result) {
    const final = result.final.temperature;
    const peak = result.peakTemperature;
    if (final < 1.5 && peak < 1.7) {
      return { level: 'great', title: 'Le monde est sauvé (ou presque)', text: 'Le réchauffement repasse sous 1,5 °C : c’est l’objectif le plus ambitieux de l’accord de Paris.' };
    }
    if (final < 1.5) {
      return { level: 'good', title: 'Retour sous 1,5 °C, après un dépassement', text: `Le réchauffement monte jusqu’à ${fmt(peak)} °C avant de redescendre. Pendant ce dépassement, certains dégâts deviennent irréversibles.` };
    }
    if (final < 2) {
      return { level: 'good', title: 'Accord de Paris tenu : moins de 2 °C', text: 'C’est le scénario « limiter bien en dessous de 2 °C ». Les impacts restent forts, mais gérables pour la plupart des sociétés.' };
    }
    if (final < 2.5) {
      return { level: 'medium', title: 'Un monde nettement plus chaud', text: 'Au-delà de 2 °C, les canicules, sécheresses et pertes de récoltes s’aggravent fortement, et plusieurs points de bascule sont dépassés.' };
    }
    if (final < 3.5) {
      return { level: 'bad', title: 'Le monde ne va pas bien', text: 'C’est la trajectoire des politiques actuelles. Une grande partie des coraux disparaît, certaines régions deviennent difficiles à habiter.' };
    }
    return { level: 'terrible', title: 'Un monde en crise', text: 'Un réchauffement de cette ampleur n’a pas été connu depuis des millions d’années. Les impacts dépassent les capacités d’adaptation de nombreuses régions.' };
  }

  function renderVerdict(result) {
    const v = verdictFor(result);
    const box = document.getElementById('verdict');
    box.className = `verdict panel verdict-${v.level}`;
    const warnings = [];
    const notes = [];
    const geoUsed = levers.stratosphericAerosols + levers.cloudBrightening + levers.spaceSunshade > 0;
    if (geoUsed) {
      warnings.push('Tu utilises la géo-ingénierie solaire : elle cache le réchauffement mais ne retire pas le CO₂. Les océans continuent de s’acidifier.');
    }
    // Effet de masque des aérosols : moins de charbon = moins de particules qui renvoient le soleil.
    const t2045 = (r) => r.years.find((y) => y.year === 2045).temperature;
    if (baseline && result !== baseline && t2045(result) > t2045(baseline) + 0.02) {
      notes.push(
        'Pourquoi ça chauffe un peu plus au début ? La fumée des centrales à charbon et des usines contient des particules qui renvoient une partie du soleil vers l’espace. En les fermant, on perd ce « parasol » : c’est un effet réel, décrit par le GIEC. Il disparaît ensuite, car le CO₂ évité, lui, compte pendant des siècles.'
      );
    }
    if (geoUsed && levers.geoStopYear != null) {
      warnings.push(`Arrêt brutal en ${levers.geoStopYear} : la chaleur cachée revient d’un coup, bien trop vite pour que la nature s’adapte.`);
    }
    box.innerHTML = '';
    const h = document.createElement('p');
    h.className = 'verdict-title';
    h.textContent = `${v.title} — ${fmt(result.final.temperature)} °C en 2100`;
    const p = document.createElement('p');
    p.textContent = v.text;
    box.append(h, p);
    for (const w of warnings) {
      const wp = document.createElement('p');
      wp.className = 'warning';
      wp.textContent = w;
      box.appendChild(wp);
    }
    for (const n of notes) {
      const np = document.createElement('p');
      np.className = 'fact';
      np.textContent = n;
      box.appendChild(np);
    }
  }

  function stat(label, value, hint) {
    const div = document.createElement('div');
    div.className = 'stat panel';
    const l = document.createElement('p');
    l.className = 'stat-label';
    l.textContent = label;
    const v = document.createElement('p');
    v.className = 'stat-value';
    v.textContent = value;
    div.append(l, v);
    if (hint) {
      const h = document.createElement('p');
      h.className = 'stat-hint';
      h.textContent = hint;
      div.appendChild(h);
    }
    return div;
  }

  function renderStats(result) {
    const f = result.final;
    const box = document.getElementById('stats');
    box.replaceChildren(
      stat('Réchauffement en 2100', `${fmt(f.temperature)} °C`, `${fmt(result.present.temperature)} °C aujourd’hui`),
      stat('Pic de réchauffement', `${fmt(result.peakTemperature)} °C`, result.peakYear > PRESENT_YEAR ? `atteint en ${result.peakYear}` : 'déjà atteint'),
      stat('Montée des mers', `+${Math.round(f.seaLevel / 10)} cm`, 'de 2025 à 2100, et elle continuera après'),
      stat('Arctique sans glace en été', result.iceFreeYear ? `dès ${result.iceFreeYear}` : 'évité', 'moins d’1 million de km² en septembre'),
      stat('Zéro émission nette', result.netZeroYear ? `en ${result.netZeroYear}` : 'après 2100', 'on absorbe autant qu’on émet'),
      stat('Acidité des océans (pH)', fmt(f.ph, 2), `${fmt(result.present.ph, 2)} aujourd’hui, 8,17 avant 1850`)
    );
  }

  function series(result, key, fromYear) {
    return result.years.filter((y) => y.year >= fromYear).map((y) => [y.year, y[key]]);
  }

  function renderCharts(result) {
    const scenario = css('--chart-scenario');
    const reference = css('--chart-baseline');
    const warn = css('--warn');
    const danger = css('--danger');
    const showBaseline = baseline !== result;
    const withBaseline = (key, from, label) => [
      ...(showBaseline ? [{ label: 'Sans rien faire', color: reference, values: series(baseline, key, from), dashed: true, width: 2 }] : []),
      { label, color: scenario, values: series(result, key, from) },
    ];
    const one = (v) => fmt(v, 1);

    Charts.lineChart(document.getElementById('chart-temperature'), {
      series: withBaseline('temperature', 1850, 'Ton scénario'),
      refLines: [{ value: 1.5, label: '1,5 °C', color: warn }, { value: 2, label: '2 °C', color: danger }],
      yMin: 0, marker: PRESENT_YEAR, yFormat: one,
      ariaLabel: `Réchauffement : ${one(result.final.temperature)} °C en 2100`,
    });
    Charts.lineChart(document.getElementById('chart-emissions'), {
      series: withBaseline('co2Emitted', 1950, 'Ton scénario'),
      refLines: [{ value: 0, label: 'zéro net' }],
      marker: PRESENT_YEAR, yFormat: (v) => String(Math.round(v)),
      ariaLabel: 'Émissions nettes de CO₂',
    });
    Charts.lineChart(document.getElementById('chart-co2'), {
      series: withBaseline('co2', 1850, 'Ton scénario'),
      refLines: [{ value: 278, label: 'avant 1850 : 278 ppm' }],
      marker: PRESENT_YEAR, yFormat: (v) => String(Math.round(v)),
      ariaLabel: `CO₂ : ${Math.round(result.final.co2)} ppm en 2100`,
    });
    Charts.lineChart(document.getElementById('chart-ice'), {
      series: withBaseline('seaIce', PRESENT_YEAR, 'Ton scénario'),
      refLines: [{ value: 1, label: '« sans glace »', color: danger }],
      yMin: 0, yMax: 7, yFormat: one,
      ariaLabel: 'Banquise arctique en septembre',
    });
  }

  function renderTipping(result) {
    const list = document.getElementById('tipping');
    list.replaceChildren(
      ...result.tippingPoints.map((tp) => {
        const li = document.createElement('li');
        li.className = tp.crossed ? 'crossed' : 'safe';
        const name = document.createElement('span');
        name.className = 'tp-name';
        name.textContent = tp.name;
        const info = document.createElement('span');
        info.className = 'tp-info';
        info.textContent = `${tp.crossed ? 'Seuil probablement dépassé' : 'Épargné'} · seuil ≈ ${fmt(tp.threshold)} °C (${tp.range})`;
        li.append(name, info);
        return li;
      })
    );
  }

  function renderSectors(result) {
    const y2050 = result.years.find((y) => y.year === 2050).detail;
    const rows = [
      ['Électricité et chaleur', y2050.sectors.power, SECTOR_EMISSIONS_2025.power],
      ['Transports', y2050.sectors.transport, SECTOR_EMISSIONS_2025.transport],
      ['Industrie', y2050.sectors.industry, SECTOR_EMISSIONS_2025.industry],
      ['Bâtiments', y2050.sectors.buildings, SECTOR_EMISSIONS_2025.buildings],
      ['Autres', y2050.sectors.other, SECTOR_EMISSIONS_2025.other],
      ['Déforestation', y2050.landUse, 4.1],
      ['CO₂ retiré de l’air', -y2050.removals, 0],
    ];
    const max = 16;
    const box = document.getElementById('sectors');
    box.replaceChildren(
      ...rows.map(([name, value, before]) => {
        const row = document.createElement('div');
        row.className = 'sector';
        const label = document.createElement('span');
        label.className = 'sector-name';
        label.textContent = name;
        const bar = document.createElement('span');
        bar.className = 'sector-bar' + (value < 0 ? ' negative' : '');
        bar.style.setProperty('--size', `${Math.min(100, (Math.abs(value) / max) * 100)}%`);
        const val = document.createElement('span');
        val.className = 'sector-value';
        val.textContent = `${fmt(value)} Gt` + (before ? ` (${fmt(before)} en 2025)` : '');
        row.append(label, bar, val);
        return row;
      })
    );
  }

  function renderSources() {
    const box = document.getElementById('sources');
    const byType = {};
    for (const [id, src] of Object.entries(window.SOURCES)) (byType[src.type] = byType[src.type] || []).push({ id, ...src });
    for (const [type, title] of Object.entries(window.SOURCE_TYPES)) {
      const items = byType[type];
      if (!items) continue;
      const h = document.createElement('h3');
      h.textContent = title;
      const list = document.createElement('ul');
      list.className = 'source-list';
      for (const s of items.sort((a, b) => b.year - a.year)) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = s.title;
        const meta = document.createElement('span');
        meta.className = 'muted';
        meta.textContent = ` — ${s.authors}, ${s.year}.`;
        const note = document.createElement('p');
        note.className = 'source-note';
        note.textContent = s.note;
        li.append(a, meta, note);
        list.appendChild(li);
      }
      box.append(h, list);
    }
  }

  // ---------------------------------------------------------------------------
  // Mise à jour et lien de partage
  // ---------------------------------------------------------------------------

  let pending = false;
  function scheduleUpdate() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      update();
    });
  }

  function update() {
    syncInputs();
    if (baselineSensitivity !== levers.climateSensitivity) {
      baseline = simulate({ climateSensitivity: levers.climateSensitivity });
      baselineSensitivity = levers.climateSensitivity;
    }
    const isBaseline = Object.keys(DEFAULT_LEVERS).every(
      (k) => k === 'climateSensitivity' || levers[k] === DEFAULT_LEVERS[k]
    );
    const result = isBaseline ? baseline : simulate(levers);
    renderVerdict(result);
    renderStats(result);
    document.getElementById('mini-temperature').textContent = `${fmt(result.final.temperature)} °C`;
    renderCharts(result);
    renderTipping(result);
    renderSectors(result);
    for (const listener of resultListeners) listener(result, levers);
    // En défi, on n'écrit pas le scénario dans l'adresse (pas de solution à partager par erreur).
    if (!constraints) writeHash();
  }

  /** Le scénario est enregistré dans l'adresse de la page (#cleanPower=0.9&…) pour pouvoir le partager. */
  function writeHash() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(levers)) {
      if (v !== DEFAULT_LEVERS[k] && v != null) params.set(k, v);
    }
    const hash = params.toString();
    history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
  }

  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    for (const [k, v] of params) {
      if (!(k in DEFAULT_LEVERS)) continue;
      const lever = allLevers.find((l) => l.id === k);
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      levers[k] = lever ? Math.min(lever.max, Math.max(lever.min, n)) : n;
    }
  }

  function setupButtons() {
    document.getElementById('reset').addEventListener('click', () => {
      levers = startingLevers();
      clearPreset();
      scheduleUpdate();
    });
    document.getElementById('share').addEventListener('click', async () => {
      const status = document.getElementById('share-status');
      try {
        await navigator.clipboard.writeText(location.href);
        status.textContent = 'Lien copié !';
      } catch (e) {
        status.textContent = 'Copie impossible : copie l’adresse de la page.';
      }
    });
    // Redessine les graphiques si l'utilisateur passe en mode sombre.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', scheduleUpdate);
  }

  /** Ce que le mode défi (js/challenge-ui.js) peut piloter. */
  window.App = {
    onResult(listener) {
      resultListeners.push(listener);
    },
    /** Démarre (ou arrête avec null) des contraintes, et remet les leviers à leur valeur de départ. */
    setConstraints(next) {
      constraints = next;
      levers = startingLevers();
      clearPreset();
      document.body.classList.toggle('challenge-active', Boolean(next));
      if (!next) writeHash();
      scheduleUpdate();
    },
    /** Applique des valeurs de leviers en respectant les contraintes (pour montrer une solution). */
    showLevers(values) {
      levers = { ...startingLevers(), ...values, ...((constraints && constraints.locked) || {}) };
      scheduleUpdate();
    },
    /** Bloque ou débloque tous les curseurs (à la fin du chrono). */
    freeze(value) {
      frozen = value;
      document.getElementById('reset').disabled = value;
      scheduleUpdate();
    },
  };

  buildPresets();
  buildLevers();
  renderSources();
  setupButtons();
  readHash();
  update();
})();
