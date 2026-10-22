/*
 * Petits graphiques en courbes, dessinés en SVG (aucune bibliothèque externe).
 *
 * lineChart(élément, options) avec options :
 *   series   : [{ label, color, values: [[année, valeur], ...], dashed, width }]
 *   refLines : [{ value, label, color }]  lignes horizontales de repère
 *   xMin, xMax, yMin, yMax (facultatifs : sinon calculés)
 *   yFormat  : fonction qui écrit une valeur de l'axe vertical
 *   marker   : année marquée d'un trait vertical (par exemple « aujourd'hui »)
 */
(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const WIDTH = 480;
  const HEIGHT = 280;
  const MARGIN = { top: 18, right: 22, bottom: 32, left: 46 };

  function el(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  }

  /** Graduations « rondes » entre min et max. */
  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const rough = span / count;
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) || power * 10;
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
      ticks.push(Math.round(v / step) * step);
    }
    return ticks;
  }

  function lineChart(container, options) {
    const { series, refLines = [], marker, yFormat = (v) => String(v) } = options;
    const all = series.flatMap((s) => s.values);
    const xMin = options.xMin != null ? options.xMin : Math.min(...all.map((p) => p[0]));
    const xMax = options.xMax != null ? options.xMax : Math.max(...all.map((p) => p[0]));
    const visible = all.filter((p) => p[0] >= xMin && p[0] <= xMax).map((p) => p[1]);
    const refValues = refLines.map((r) => r.value);
    let yMin = options.yMin != null ? options.yMin : Math.min(...visible, ...refValues);
    let yMax = options.yMax != null ? options.yMax : Math.max(...visible, ...refValues);
    if (options.yMin == null || options.yMax == null) {
      const pad = (yMax - yMin) * 0.08 || 1;
      if (options.yMin == null) yMin -= pad;
      if (options.yMax == null) yMax += pad;
    }

    const plotW = WIDTH - MARGIN.left - MARGIN.right;
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const x = (v) => MARGIN.left + ((v - xMin) / (xMax - xMin)) * plotW;
    const y = (v) => MARGIN.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

    const svg = el('svg', {
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      class: 'chart-svg',
      role: 'img',
      'aria-label': options.ariaLabel || '',
    });

    // Grille et axe vertical
    for (const t of niceTicks(yMin, yMax, 5)) {
      if (t < yMin || t > yMax) continue;
      svg.appendChild(el('line', { x1: MARGIN.left, x2: WIDTH - MARGIN.right, y1: y(t), y2: y(t), class: 'chart-grid' }));
      svg.appendChild(el('text', { x: MARGIN.left - 8, y: y(t) + 4, class: 'chart-tick', 'text-anchor': 'end' }, yFormat(t)));
    }
    // Axe horizontal (années)
    for (const t of niceTicks(xMin, xMax, 6)) {
      if (t < xMin || t > xMax) continue;
      svg.appendChild(el('text', { x: x(t), y: HEIGHT - 8, class: 'chart-tick', 'text-anchor': 'middle' }, String(t)));
    }

    // Repère « aujourd'hui »
    if (marker != null && marker > xMin && marker < xMax) {
      svg.appendChild(el('line', { x1: x(marker), x2: x(marker), y1: MARGIN.top, y2: MARGIN.top + plotH, class: 'chart-marker' }));
      svg.appendChild(el('text', { x: x(marker) + 4, y: MARGIN.top + 10, class: 'chart-marker-label' }, 'aujourd’hui'));
    }

    // Lignes de repère horizontales (1,5 °C, 2 °C…)
    for (const r of refLines) {
      if (r.value < yMin || r.value > yMax) continue;
      svg.appendChild(el('line', {
        x1: MARGIN.left, x2: WIDTH - MARGIN.right, y1: y(r.value), y2: y(r.value),
        class: 'chart-ref', style: r.color ? `stroke:${r.color}` : '',
      }));
      svg.appendChild(el('text', {
        x: WIDTH - MARGIN.right - 4, y: y(r.value) - 5, class: 'chart-ref-label', 'text-anchor': 'end',
        style: r.color ? `fill:${r.color}` : '',
      }, r.label));
    }

    // Courbes
    for (const s of series) {
      const pts = s.values.filter((p) => p[0] >= xMin && p[0] <= xMax);
      if (pts.length < 2) continue;
      const d = pts
        .map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(Math.max(yMin, Math.min(yMax, p[1]))).toFixed(1)}`)
        .join('');
      svg.appendChild(el('path', {
        d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2.5,
        'stroke-dasharray': s.dashed ? '6 5' : 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }));
    }

    container.replaceChildren(svg);

    // Légende (en HTML, plus lisible)
    if (options.legend !== false) {
      const legend = document.createElement('ul');
      legend.className = 'chart-legend';
      for (const s of series) {
        if (!s.label) continue;
        const item = document.createElement('li');
        const swatch = document.createElement('span');
        swatch.className = 'chart-swatch' + (s.dashed ? ' dashed' : '');
        swatch.style.setProperty('--swatch', s.color);
        item.append(swatch, s.label);
        legend.appendChild(item);
      }
      container.appendChild(legend);
    }
  }

  root.Charts = { lineChart, niceTicks };
})(window);
