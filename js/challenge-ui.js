/*
 * Mode défi : choix d'un défi, chrono, objectifs suivis en direct, validation et étoiles.
 * S'appuie sur window.App (js/app.js) pour piloter les leviers.
 */
(function () {
  'use strict';

  const { CHALLENGES, LEVEL_NAMES } = window;
  const STORAGE_KEY = 'sauver-le-monde-defis';
  const WARNING_SECONDS = 15;

  let current = null; // défi en cours
  let deadline = 0;
  let timer = null;
  let lastResult = null;
  let lastCosts = null;
  let finished = false;

  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Meilleurs scores (gardés seulement dans ce navigateur)
  // ---------------------------------------------------------------------------

  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveBest(id, stars) {
    const best = loadBest();
    if ((best[id] || 0) >= stars) return;
    best[id] = stars;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(best));
    } catch (e) {
      // Stockage indisponible (navigation privée) : tant pis, le jeu marche quand même.
    }
  }

  const starText = (n, total = 3) => '★'.repeat(n) + '☆'.repeat(total - n);

  // ---------------------------------------------------------------------------
  // Choix du mode et liste des défis
  // ---------------------------------------------------------------------------

  function setMode(mode) {
    const challenge = mode === 'challenge';
    $('mode-sandbox').setAttribute('aria-pressed', String(!challenge));
    $('mode-challenge').setAttribute('aria-pressed', String(challenge));
    stopChallenge();
    $('challenge-list').hidden = !challenge;
    if (challenge) renderList();
  }

  function renderList() {
    const best = loadBest();
    const list = $('challenge-cards');
    list.replaceChildren(
      ...CHALLENGES.map((c) => {
        const li = document.createElement('li');
        li.className = 'challenge-card panel';
        const head = document.createElement('div');
        head.className = 'challenge-card-head';
        const level = document.createElement('span');
        level.className = `level level-${c.level}`;
        level.textContent = LEVEL_NAMES[c.level];
        const stars = document.createElement('span');
        stars.className = 'stars';
        stars.textContent = starText(best[c.id] || 0);
        stars.setAttribute('aria-label', `Meilleur score : ${best[c.id] || 0} étoile(s) sur 3`);
        head.append(level, stars);
        const h = document.createElement('h3');
        h.textContent = c.name;
        const p = document.createElement('p');
        p.textContent = c.pitch;
        const time = document.createElement('p');
        time.className = 'muted';
        time.textContent = `⏱ ${formatTime(c.seconds)} · budget ${c.budget.toLocaleString('fr-FR')} milliards $ par an`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button';
        button.textContent = 'Jouer';
        button.addEventListener('click', () => startChallenge(c));
        li.append(head, h, p, time, button);
        return li;
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Déroulement d'un défi
  // ---------------------------------------------------------------------------

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function startChallenge(challenge) {
    current = challenge;
    finished = false;
    closeDialog();
    $('challenge-list').hidden = true;
    $('challenge-bar').hidden = false;
    $('challenge-name').textContent = challenge.name;
    $('challenge-pitch').textContent = challenge.pitch;
    $('challenge-feedback').textContent = '';
    $('challenge-validate').hidden = false;
    $('challenge-retry').hidden = true;
    window.App.freeze(false);
    window.App.setConstraints({ locked: challenge.locked, limits: challenge.limits });
    deadline = Date.now() + challenge.seconds * 1000;
    clearInterval(timer);
    timer = setInterval(tick, 250);
    tick();
    updateClock();
    $('challenge-bar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function stopChallenge() {
    clearInterval(timer);
    timer = null;
    current = null;
    $('challenge-bar').hidden = true;
    updateClock();
    closeDialog();
    window.App.freeze(false);
    window.App.setConstraints(null);
  }

  function tick() {
    const left = (deadline - Date.now()) / 1000;
    $('challenge-timer').textContent = formatTime(left);
    $('challenge-clock-time').textContent = formatTime(left);
    for (const clock of [$('challenge-timer'), $('challenge-clock')]) {
      clock.classList.toggle('urgent', left <= WARNING_SECONDS);
    }
    if (left <= 0) finish(true);
  }

  // La pastille du chrono n'apparaît que lorsque le bandeau du défi n'est plus visible.
  let barVisible = true;
  function updateClock() {
    $('challenge-clock').hidden = !current || finished || barVisible;
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      barVisible = entries[0].isIntersecting;
      updateClock();
    }).observe($('challenge-bar'));
  }

  function goalsMet(result, costs) {
    return current.goals.every((g) => g.test(result, costs));
  }

  /** Met à jour la liste des objectifs à chaque changement de levier. */
  function renderGoals(result, levers, costs) {
    lastResult = result;
    lastCosts = costs;
    if (!current) return;
    // Le message « Pas encore » n'est plus d'actualité dès que le plan change.
    if (!finished) $('challenge-feedback').textContent = '';
    $('challenge-goals').replaceChildren(
      ...current.goals.map((g) => {
        const ok = g.test(result, costs);
        const li = document.createElement('li');
        li.className = ok ? 'met' : 'unmet';
        const mark = document.createElement('span');
        mark.className = 'goal-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = ok ? '✓' : '✗';
        const text = document.createElement('span');
        text.textContent = `${g.label} — ${g.value(result, costs)}`;
        const sr = document.createElement('span');
        sr.className = 'visually-hidden';
        sr.textContent = ok ? ' (atteint)' : ' (pas encore)';
        li.append(mark, text, sr);
        return li;
      })
    );
    $('challenge-levers').textContent =
      `★ bonus si le coût reste sous ${current.thrifty.toLocaleString('fr-FR')} milliards $ par an`;
  }

  function validate() {
    if (!current || finished || !lastResult) return;
    if (goalsMet(lastResult, lastCosts)) {
      finish(false);
    } else {
      const missing = current.goals.filter((g) => !g.test(lastResult, lastCosts)).map((g) => g.label.charAt(0).toLowerCase() + g.label.slice(1));
      $('challenge-feedback').textContent = `Pas encore : ${missing.join(' ; ')}. Continue !`;
    }
  }

  /** Fin du défi : réussite si les objectifs sont atteints (même au gong). */
  function finish(timeUp) {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    timer = null;
    const left = Math.max(0, (deadline - Date.now()) / 1000);
    const won = lastResult && goalsMet(lastResult, lastCosts);
    window.App.freeze(true);
    updateClock();

    let stars = 0;
    const reasons = [];
    if (won) {
      stars = 1;
      reasons.push('★ Objectif atteint');
      if (left >= current.seconds / 2) {
        stars += 1;
        reasons.push('★ Plus de la moitié du temps restant');
      } else {
        reasons.push('☆ Plus de la moitié du temps restant');
      }
      const cost = Math.round(lastCosts.total.central);
      const n = (v) => v.toLocaleString('fr-FR');
      if (cost <= current.thrifty) {
        stars += 1;
        reasons.push(`★ Économe : ${n(cost)} milliards $ par an (sous ${n(current.thrifty)})`);
      } else {
        reasons.push(`☆ Économe : ${n(cost)} milliards $ par an (il fallait moins de ${n(current.thrifty)})`);
      }
      saveBest(current.id, stars);
    }
    showDialog({ won, timeUp, stars, reasons, left });
  }

  // ---------------------------------------------------------------------------
  // Fenêtre de résultat
  // ---------------------------------------------------------------------------

  function showDialog({ won, timeUp, stars, reasons, left }) {
    const dialog = $('challenge-dialog');
    $('dialog-title').textContent = won ? 'Défi réussi !' : timeUp ? 'Temps écoulé…' : 'Défi terminé';
    $('dialog-stars').textContent = won ? starText(stars) : '';
    $('dialog-stars').setAttribute('aria-label', won ? `${stars} étoile(s) sur 3` : '');
    $('dialog-summary').textContent = won
      ? `Tu as trouvé un plan en ${formatTime(current.seconds - left)}.`
      : 'Les objectifs ne sont pas atteints. Regarde une solution possible, puis réessaie !';
    const list = $('dialog-reasons');
    list.replaceChildren(
      ...reasons.map((r) => {
        const li = document.createElement('li');
        li.textContent = r;
        return li;
      })
    );
    $('dialog-lesson').textContent = current.lesson;
    $('dialog-solution').hidden = won;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog() {
    const dialog = $('challenge-dialog');
    if (dialog.open) dialog.close();
  }

  function setup() {
    $('mode-sandbox').addEventListener('click', () => setMode('sandbox'));
    $('mode-challenge').addEventListener('click', () => setMode('challenge'));
    $('challenge-validate').addEventListener('click', validate);
    $('challenge-quit').addEventListener('click', () => setMode('challenge'));
    $('dialog-retry').addEventListener('click', () => startChallenge(current));
    $('dialog-other').addEventListener('click', () => setMode('challenge'));
    $('dialog-solution').addEventListener('click', () => {
      closeDialog();
      window.App.showLevers(current.solution);
      $('challenge-feedback').textContent =
        'Voici une solution possible (il en existe d’autres). Appuie sur « Rejouer » pour retenter ta chance.';
      $('challenge-validate').hidden = true;
      $('challenge-retry').hidden = false;
    });
    $('challenge-retry').addEventListener('click', () => startChallenge(current));
    $('challenge-clock').addEventListener('click', () =>
      $('challenge-bar').scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
    // Fermer la fenêtre avec Échap laisse le défi terminé, avec les curseurs bloqués.
    window.App.onResult(renderGoals);
  }

  setup();
})();
