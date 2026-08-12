'use strict';

/**
 * Pure renderer. Draws whatever the server broadcasts; makes zero game
 * decisions. The ring fraction is just progress/duration scaling (the
 * server already computed pinProgressMs on its own clock).
 */
(function (global) {
  // Render-only mirror of server/constants.js PIN_DURATION_MS, used purely
  // to scale the ring bar. Kept in sync with the server constant.
  const PIN_DURATION_MS = 1800;

  const RING_RADIUS = 88;
  const RING_CIRC = 2 * Math.PI * RING_RADIUS;

  let myRole = null;
  let lastState = null;
  let flashTimer = null;
  let shakeTimer = null;

  const el = {
    armCat: document.getElementById('arm-cat'),
    armBird: document.getElementById('arm-bird'),
    charCat: document.getElementById('char-cat'),
    charBird: document.getElementById('char-bird'),
    scoreCat: document.getElementById('score-cat'),
    scoreBird: document.getElementById('score-bird'),
    ringWrap: document.getElementById('ring-wrap'),
    ringProgress: document.getElementById('ring-progress'),
    ringLabel: document.getElementById('ring-label'),
    handCat: document.getElementById('hand-cat'),
    handBird: document.getElementById('hand-bird'),
    flash: document.getElementById('round-flash'),
    toast: document.getElementById('toast')
  };

  el.ringProgress.style.strokeDasharray = String(RING_CIRC);
  el.ringProgress.style.strokeDashoffset = String(RING_CIRC);

  function setScores(catScore, birdScore) {
    el.scoreCat.textContent = String(catScore);
    el.scoreBird.textContent = String(birdScore);
  }

  function setHandClass(wrap, handState) {
    const down = handState === 'down';
    wrap.classList.toggle('down', down);
    wrap.classList.toggle('up', !down);
  }

  function renderTable(state) {
    setHandClass(el.armCat, state.cat.handState);
    setHandClass(el.armBird, state.bird.handState);
  }

  function showRing() {
    el.ringWrap.classList.remove('hidden');
  }

  function hideRing() {
    el.ringWrap.classList.add('hidden');
  }

  function setRingProgress(fraction) {
    const f = Math.max(0, Math.min(1, fraction));
    el.ringProgress.style.strokeDashoffset = String(RING_CIRC * (1 - f));
  }

  function markRoles(role) {
    el.handCat.classList.toggle('is-you', role === 'cat');
    el.handBird.classList.toggle('is-you', role === 'bird');
    el.handCat.classList.toggle('is-opponent', role !== 'cat');
    el.handBird.classList.toggle('is-opponent', role !== 'bird');
  }

  function init(role) {
    myRole = role;
    lastState = null;
    el.armCat.classList.add('up');
    el.armCat.classList.remove('down');
    el.armBird.classList.add('up');
    el.armBird.classList.remove('down');
    hideRing();
    setScores(0, 0);
    markRoles(role);
  }

  function renderState(state) {
    lastState = state;
    renderTable(state);
    setScores(state.cat.score, state.bird.score);
    if (state.pinnerRole) {
      showRing();
      setRingProgress(state.pinProgressMs / PIN_DURATION_MS);
    } else {
      hideRing();
    }
  }

  function showPinStarted(pinner) {
    el.ringWrap.classList.toggle('pinner-cat', pinner === 'cat');
    el.ringWrap.classList.toggle('pinner-bird', pinner === 'bird');
    el.ringLabel.textContent = pinner === 'cat' ? 'CAT' : 'BIRD';
    showRing();
    setRingProgress(0);
  }

  function struggle(by) {
    const target = by === 'cat' ? el.charCat : el.charBird;
    target.classList.remove('shake');
    void target.offsetWidth; // restart the animation
    target.classList.add('shake');
    if (shakeTimer) clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => target.classList.remove('shake'), 600);
  }

  function flash(text, cls) {
    el.flash.textContent = text;
    el.flash.className = 'round-flash show' + (cls ? ' ' + cls : '');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.flash.classList.remove('show'), 900);
  }

  let toastTimer = null;
  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2200);
  }

  function getScores() {
    return lastState
      ? { cat: lastState.cat.score, bird: lastState.bird.score }
      : { cat: 0, bird: 0 };
  }

  function reset() {
    myRole = null;
    lastState = null;
    el.armCat.classList.add('up');
    el.armCat.classList.remove('down');
    el.armBird.classList.add('up');
    el.armBird.classList.remove('down');
    hideRing();
    setScores(0, 0);
  }

  global.GameRender = {
    init,
    renderState,
    showPinStarted,
    struggle,
    flash,
    toast,
    getScores,
    reset
  };
})(window);
