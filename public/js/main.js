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
  let chosenRole = 'cat';
  let chatOpen = false;
  let chatUnread = 0;

  /* ---------------- role picker (creator) ---------------- */

  function setChosenRole(role) {
    chosenRole = role;
    document.querySelectorAll('.role-card').forEach((card) => {
      const isActive = card.dataset.role === role;
      card.classList.toggle('active', isActive);
      card.setAttribute('aria-pressed', String(isActive));
    });
  }

  document.querySelectorAll('.role-card').forEach((card) => {
    card.addEventListener('click', () => setChosenRole(card.dataset.role));
  });

  /* ---------------- chat ---------------- */

  const chatMessagesEl = document.getElementById('chat-messages');
  const chatPanel = document.getElementById('chat-panel');
  const chatToggle = document.getElementById('chat-toggle');
  const chatDot = document.getElementById('chat-dot');
  const chatInput = document.getElementById('chat-input');

  function appendChatMessage(msg) {
    const mine = msg.role === myRole;
    const row = document.createElement('div');
    row.className = 'chat-msg' + (mine ? ' mine' : '');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    const who = document.createElement('span');
    who.className = 'chat-who';
    who.textContent = msg.role === 'cat' ? 'Cat' : 'Bird';
    const text = document.createElement('span');
    text.className = 'chat-text';
    text.textContent = msg.text;
    bubble.appendChild(who);
    bubble.appendChild(text);
    row.appendChild(bubble);
    chatMessagesEl.appendChild(row);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  function clearChat() {
    chatMessagesEl.innerHTML = '';
    chatUnread = 0;
    chatDot.classList.add('hidden');
  }

  function setChatOpen(open) {
    chatOpen = open;
    chatPanel.classList.toggle('open', open);
    chatToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      chatUnread = 0;
      chatDot.classList.add('hidden');
      chatInput.focus();
    }
  }

  chatToggle.addEventListener('click', () => setChatOpen(!chatOpen));
  document.getElementById('chat-close').addEventListener('click', () => setChatOpen(false));
  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    SocketClient.sendChat(text);
    chatInput.value = '';
    chatInput.focus();
  });

  /* ---------------- rematch (both players must agree) ---------------- */

  function setRematchBar(role, vote) {
    const bar = document.getElementById('rematch-bar-' + role);
    if (!bar) return;
    bar.classList.toggle('yes', vote === 'yes');
    bar.classList.toggle('no', vote === 'no');
    bar.classList.toggle('undecided', !vote);
    if (vote === 'yes') bar.textContent = 'Rematch';
    else if (vote === 'no') bar.textContent = 'No';
    else bar.textContent = 'Waiting…';
  }

  function setRematchOptionEnabled(role, enabled) {
    const yesBtn = document.getElementById('rematch-yes-' + role);
    const noBtn = document.getElementById('rematch-no-' + role);
    if (!yesBtn || !noBtn) return;
    yesBtn.disabled = !enabled;
    noBtn.disabled = !enabled;
  }

  function markRematchChoice(role, choice) {
    const yesBtn = document.getElementById('rematch-yes-' + role);
    const noBtn = document.getElementById('rematch-no-' + role);
    if (!yesBtn || !noBtn) return;
    yesBtn.classList.toggle('active', choice === 'yes');
    noBtn.classList.toggle('active', choice === 'no');
  }

  function showScreen(id) {
    currentScreen = id;
    SCREENS.forEach((s) => $(`#${s}`).classList.toggle('active', s === id));
    // Chat lives only while you are in a room (lobby / game / match over).
    document.body.classList.toggle('in-session', id !== 'screen-home');
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
    setChatOpen(false);
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
      // Chats vanish when the match is over.
      clearChat();
      setChatOpen(false);
      ['cat', 'bird'].forEach((role) => {
        setRematchBar(role, null);
        setRematchOptionEnabled(role, role === myRole);
      });
      showScreen('screen-matchover');
    },
    onRematchUpdate: (d) => {
      if (d.cat) setRematchBar('cat', d.cat);
      if (d.bird) setRematchBar('bird', d.bird);
    },
    onChatMessage: (msg) => {
      appendChatMessage(msg);
      if (!chatOpen) {
        chatUnread += 1;
        chatDot.classList.remove('hidden');
      }
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

  $('#btn-create').addEventListener('click', () => SocketClient.createRoom(chosenRole));
  $('#btn-join').addEventListener('click', joinFromHome);
  $('#join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinFromHome(); });

  ['cat', 'bird'].forEach((role) => {
    const yesBtn = document.getElementById('rematch-yes-' + role);
    const noBtn = document.getElementById('rematch-no-' + role);
    yesBtn.dataset.state = 'yes';
    noBtn.dataset.state = 'no';
    yesBtn.addEventListener('click', () => {
      if (role !== myRole) return;
      markRematchChoice(role, 'yes');
      setRematchBar(role, 'yes');
      SocketClient.rematch();
    });
    noBtn.addEventListener('click', () => {
      if (role !== myRole) return;
      markRematchChoice(role, 'no');
      setRematchBar(role, 'no');
      SocketClient.noRematch();
    });
  });

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
