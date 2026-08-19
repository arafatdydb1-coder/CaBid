'use strict';

/**
 * Sound effects. Each effect plays a file dropped into public/sounds/:
 *   bird-lose.mp3  -> played when the BIRD loses
 *   cat-lose.mp3   -> played when the CAT loses
 *
 * Mobile/autoplay note: phones (esp. iOS Safari) only allow media to start
 * from inside a real user gesture. The match-over event arrives over a
 * websocket, so we PRELOAD + PRIME the <audio> elements on the first tap,
 * then reuse those same primed elements to play later. This is the trick
 * that makes sound actually fire on phones.
 */
(function (global) {
  const FILES = {
    'bird-lose': 'sounds/bird-lose.mp3',
    'cat-lose': 'sounds/cat-lose.mp3'
  };

  let enabled = true;
  let primed = false;
  const els = {}; // name -> HTMLAudioElement (preloaded + unlocked)

  function build(name) {
    const audio = new Audio(FILES[name]);
    audio.volume = 0.6;
    audio.preload = 'auto';
    audio.load();
    els[name] = audio;
    return audio;
  }

  // Called on the first user gesture. Create elements and "unlock" them by
  // starting + immediately pausing playback. Required for iOS.
  function unlock() {
    if (primed) return;
    primed = true;
    Object.keys(FILES).forEach((name) => {
      const audio = els[name] || build(name);
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => { audio.pause(); audio.currentTime = 0; })
         .catch(() => { /* ignore — will retry on next play */ });
      } else {
        try { audio.pause(); audio.currentTime = 0; } catch (e) { /* ignore */ }
      }
    });
  }

  function play(name) {
    if (!enabled) return;
    const url = FILES[name];
    if (!url) return;

    let audio = els[name];
    if (!audio) audio = build(name);

    // Stop any clip currently playing so sounds don't overlap.
    try { audio.pause(); audio.currentTime = 0; } catch (e) { /* ignore */ }
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // Last resort: try again within the unlock gesture path next time.
      });
    }
  }

  function stop() {
    Object.keys(els).forEach((name) => {
      try { els[name].pause(); els[name].currentTime = 0; } catch (e) { /* ignore */ }
    });
  }

  global.Sound = {
    play,
    stop,
    unlock,
    setEnabled(v) { enabled = !!v; }
  };
})(window);
