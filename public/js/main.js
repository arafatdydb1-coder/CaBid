'use strict';

/**
 * Screen routing + input wiring. Listens to SocketClient events and tells
 * GameRender what to draw. No game rules live here.
 */
(function () {
  const $ = (sel) => document.querySelector(sel);

  const SCREENS = ['screen-home', 'screen-lobby', 'screen-game', 'screen-matchover'];

  let myRole = null;
  let currentScreen = 'screen-home';
  let pressing = false;

  function showScreen(id) {
    currentScreen = id;
    SCREENS.forEach((s) => $(`#${s}`).classList.toggle('active', s === id));
  }

  function setLocalArm(role, state) {
    const arm = $(`#arm-${role}`);
    if (!arm) return;
    arm.classList.toggle('down', state === 'down');
    arm.classList.toggle('up', state !== 'down');
  }

  function endSession() {
    myRole = null;
    SocketClient.inSession = false;
    SocketClient.myCode = null;
    SocketClient.myRole = null;
  }

  function goHome() {
    endSession();
    GameRender.reset();
    showScreen('screen-home');
  }

  SocketClient.init({
    onRoomCreated: (d) => {
      $('#lobby-code').textContent = d.code;
      $('#lobby-status').textContent = 'Waiting for opponent…';
      showScreen('screen-lobby');
    },
    onRoomJoined: (d) => {
      $('#lobby-code').textContent = d.code;
      $('#lobby-status').textContent = 'Waiting for opponent…';
      showScreen('screen-lobby');
    },
    onJoinError: (d) => {
      if (SocketClient.inSession) {
        // A reconnect failed because the room is gone — return home.
        endSession();
        GameRender.reset();
        showScreen('screen-home');
      }
      GameRender.toast(d.message || 'Could not join room.');
    },
    onLobbyUpdate: (d) => {
      if (d.playersConnected === 2) {
        $('#lobby-status').textContent = 'Opponent connected!';
      }
    },
    onGameStart: (d) => {
      myRole = d.yourRole;
      GameRender.init(myRole);
      showScreen('screen-game');
    },

    onStateUpdate: (d) => { GameRender.renderState(d); },
    onPinStarted: (d) => { GameRender.showPinStarted(d.pinner); },
    onPinBroken: (d) => { GameRender.flash('ESCAPED!'); },
    onStruggleAttempt: (d) => { GameRender.struggle(d.by); },
    onClash: () => { GameRender.flash('CLASH!', 'flash-clash'); },
    onPointScored: (d) => { GameRender.flash('PINNED!', 'flash-pin'); },
    onMatchOver: (d) => {
      const scores = (d && d.scores) || GameRender.getScores();
      $('#matchover-title').textContent = d.winner === 'cat' ? 'The Cat Wins!' : 'The Bird Wins!';
      $('#matchover-sub').textContent = d.winner.toUpperCase() + ' held the pin the full 1.8 seconds to take the match.';
      $('#final-cat').textContent = String(scores.cat);
      $('#final-bird').textContent = String(scores.bird);
      showScreen('screen-matchover');
    },
    onOpponentLeft: () => {
      GameRender.toast('Opponent left.');
      if (currentScreen === 'screen-game' || currentScreen === 'screen-matchover') {
        $('#lobby-code').textContent = SocketClient.myCode || '----';
        $('#lobby-status').textContent = 'Waiting for opponent…';
        showScreen('screen-lobby');
      }
    }
  });

  function joinFromHome() {
    const code = $('#join-code').value.trim().toUpperCase();
    if (code.length !== 4) {
      GameRender.toast('Enter the 4-letter room code.');
      return;
    }
    SocketClient.joinRoom(code);
  }

  $('#btn-create').addEventListener('click', () => SocketClient.createRoom());
  $('#btn-join').addEventListener('click', joinFromHome);
  $('#join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinFromHome(); });
  $('#btn-rematch').addEventListener('click', () => SocketClient.rematch());

  $('#btn-home-lobby').addEventListener('click', () => { SocketClient.leaveToHome(); goHome(); });
  $('#btn-home-end').addEventListener('click', () => { SocketClient.leaveToHome(); goHome(); });

  ['cat', 'bird'].forEach((role) => {
    const el = $(`#hand-${role}`);

    el.addEventListener('pointerdown', (e) => {
      if (role !== myRole || pressing) return;
      e.preventDefault();
      pressing = true;
      setLocalArm(role, 'down');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      SocketClient.press();
    });

    const handleRelease = () => {
      if (role !== myRole || !pressing) return;
      pressing = false;
      setLocalArm(role, 'up');
      SocketClient.release();
    };

    el.addEventListener('pointerup', handleRelease);
    el.addEventListener('pointercancel', handleRelease);
    el.addEventListener('lostpointercapture', handleRelease);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });
})();
