/*
 * Carte du monde des impacts : chaque région prend la couleur de son niveau de risque
 * pour le réchauffement de l'année choisie, dans le scénario en cours.
 * S'appuie sur js/world-map.js (formes), js/impacts.js (données) et window.App (résultats).
 */
(function () {
  'use strict';

  const { WORLD_MAP, REGION_IMPACTS, LEVELS, GRAVITY_LABELS, hotExtremeFactor, impactProgress, impactState, regionLevel } =
    window;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const fmt = (v, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const $ = (id) => document.getElementById(id);

  let result = null;
  let selected = 'europe';
  const paths = {};

  function temperatureAt(year) {
    return result.years.find((y) => y.year === year).temperature;
  }

  function buildMap() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${WORLD_MAP.width} ${WORLD_MAP.height}`);
    svg.setAttribute('class', 'impact-map');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', 'Carte du monde des impacts, région par région');
    for (const [id, shape] of Object.entries(WORLD_MAP.regions)) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', shape.d);
      path.setAttribute('class', 'region');
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.addEventListener('click', () => select(id));
      path.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select(id);
        }
      });
      const title = document.createElementNS(SVG_NS, 'title');
      path.appendChild(title);
      svg.appendChild(path);
      paths[id] = path;
    }
    $('impact-map').replaceChildren(svg);

    // Légende
    $('impact-legend').replaceChildren(
      ...LEVELS.map((l) => {
        const li = document.createElement('li');
        const swatch = document.createElement('span');
        swatch.className = `risk-swatch risk-${l.id}`;
        li.append(swatch, l.label);
        return li;
      })
    );

    // Liste des régions (pour choisir sans la carte, au clavier ou au lecteur d'écran)
    const picker = $('impact-region-select');
    for (const [id, r] of Object.entries(REGION_IMPACTS)) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = r.name;
      picker.appendChild(option);
    }
    picker.value = selected;
    picker.addEventListener('change', () => select(picker.value));
    $('impact-year').addEventListener('input', render);
  }

  function select(id) {
    selected = id;
    $('impact-region-select').value = id;
    render();
  }

  function render() {
    if (!result) return;
    const year = Number($('impact-year').value);
    const t = temperatureAt(year);
    $('impact-year-value').textContent = `${year} · ${fmt(t)} °C de réchauffement`;
    $('impact-heat').textContent =
      `Partout dans le monde, les chaleurs extrêmes qui arrivaient une fois tous les 10 ans avant 1850 ` +
      `arrivent environ ${fmt(hotExtremeFactor(t))} fois plus souvent.`;

    for (const [id, path] of Object.entries(paths)) {
      const level = regionLevel(id, t);
      path.setAttribute('class', `region risk-${level}` + (id === selected ? ' selected' : ''));
      path.setAttribute('aria-pressed', String(id === selected));
      path.setAttribute('aria-label', `${REGION_IMPACTS[id].name} : risque ${LEVELS[level].label.toLowerCase()}`);
      path.firstChild.textContent = `${REGION_IMPACTS[id].name} : ${LEVELS[level].label}`;
    }
    renderDetail(t);
  }

  function renderDetail(t) {
    const region = REGION_IMPACTS[selected];
    const level = regionLevel(selected, t);
    $('impact-region-name').textContent = region.name;
    const badge = $('impact-region-level');
    badge.textContent = `Risque ${LEVELS[level].label.toLowerCase()}`;
    badge.className = `risk-badge risk-${level}`;
    $('impact-region-intro').textContent =
      region.intro +
      (region.vulnerability > 1
        ? ' Le GIEC la classe parmi les régions les plus vulnérables (populations exposées, moyens limités pour s’adapter) : ses risques comptent davantage.'
        : '');

    $('impact-list').replaceChildren(
      ...region.impacts.map((impact) => {
        const li = document.createElement('li');
        const progress = impactProgress(impact, t);
        li.className = progress === 0 ? 'avoided' : t < impact.threshold ? 'starting' : 'active';
        li.style.setProperty('--progress', `${Math.round(progress * 100)}%`);
        const text = document.createElement('span');
        text.textContent = impact.text;
        const info = document.createElement('span');
        info.className = 'impact-info';
        const names = impact.sources.map((s) => window.SOURCES[s].authors.split(',')[0]).join(', ');
        const gravity = '●'.repeat(impact.weight) + '○'.repeat(3 - impact.weight);
        info.textContent =
          `${impactState(impact, t)} · seuil ≈ ${fmt(impact.threshold)} °C · gravité ${gravity} ` +
          `(${GRAVITY_LABELS[impact.weight]}) · ${names}`;
        const bar = document.createElement('span');
        bar.className = 'impact-bar';
        bar.setAttribute('aria-hidden', 'true');
        li.append(text, bar, info);
        return li;
      })
    );
  }

  buildMap();
  window.App.onResult((r) => {
    result = r;
    render();
  });
})();
