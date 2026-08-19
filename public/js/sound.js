'use strict';

/**
 * Sound effects. Each effect first tries to play a file dropped into
 * public/sounds/ (e.g. sounds/bird-lose.mp3). If the file is missing or
 * blocked, it falls back to a short sound synthesized with the Web Audio
 * API so the game still "makes noise" out of the box.
 *
 * To use real audio: drop your files in public/sounds/ with these names:
 *   bird-lose.mp3  -> played when the BIRD loses
 *   cat-lose.mp3   -> played when the CAT loses
 */
(function (global) {
  const FILES = {
    'bird-lose': 'sounds/bird-lose.mp3',
    'cat-lose': 'sounds/cat-lose.mp3'
  };

  // Keep a reference so the element isn't garbage-collected mid-playback.
  let activeAudio = null;

  let enabled = true;
  let ctx = null;

  function getCtx() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function playFile(name, fallback) {
    const url = FILES[name];
    if (!url) {
      fallback();
      return;
    }
    // Stop any previously playing clip so sounds don't overlap.
    if (activeAudio) {
      try { activeAudio.pause(); activeAudio.currentTime = 0; } catch (e) { /* ignore */ }
      activeAudio = null;
    }
    const audio = new Audio(url);
    audio.volume = 0.6;
    activeAudio = audio; // hold reference so it plays to the end
    const done = audio.play();
    if (done && typeof done.catch === 'function') {
      done.catch(() => { activeAudio = null; fallback(); });
    } else {
      audio.addEventListener('ended', () => { if (activeAudio === audio) activeAudio = null; });
    }
  }

  // ---- Synthesized fallbacks ----

  function tone(freq, start, dur, type, gain) {
    const c = getCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, c.currentTime + start);
    g.gain.setValueAtTime(0.0001, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain || 0.3, c.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
    osc.connect(g).connect(c.destination);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + dur + 0.02);
  }

  // Angry bird: a fast, descending squawk (high chirps).
  function birdLoseSynth() {
    tone(900, 0.00, 0.12, 'square', 0.3);
    tone(720, 0.10, 0.12, 'square', 0.3);
    tone(560, 0.20, 0.18, 'sawtooth', 0.3);
    tone(380, 0.34, 0.25, 'square', 0.3);
  }

  // Angry cat: a low, buzzy growl with a downward meow.
  function catLoseSynth() {
    tone(220, 0.00, 0.30, 'sawtooth', 0.35);
    tone(180, 0.28, 0.30, 'sawtooth', 0.35);
    tone(140, 0.56, 0.40, 'square', 0.3);
  }

  const FALLBACKS = {
    'bird-lose': birdLoseSynth,
    'cat-lose': catLoseSynth
  };

  function play(name) {
    if (!enabled) return;
    const fb = FALLBACKS[name] || function () {};
    playFile(name, fb);
  }

  // Unlock audio on first user gesture (browser autoplay policy).
  function unlock() {
    getCtx();
  }

  function stop() {
    if (activeAudio) {
      try { activeAudio.pause(); activeAudio.currentTime = 0; } catch (e) { /* ignore */ }
      activeAudio = null;
    }
  }

  global.Sound = {
    play,
    stop,
    unlock,
    setEnabled(v) { enabled = !!v; }
  };
})(window);
