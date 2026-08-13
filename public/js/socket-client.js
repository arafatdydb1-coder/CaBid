'use strict';

/**
 * Thin wrapper around the socket.io client.
 * Only translates wire events into callbacks — no game decisions here.
 */
(function (global) {
  const SocketClient = {
    socket: null,
    myCode: null,
    myRole: null,
    inSession: false,

    init(callbacks) {
      this._cbs = callbacks || {};

      this.socket = io({
        reconnection: true,
        reconnectionDelay: 500,
        reconnectionDelayMax: 3000,
        reconnectionAttempts: Infinity,
        timeout: 10000
      });

      // Fires on first connect AND every auto-reconnect.
      this.socket.on('connect', () => {
        if (this.inSession && this.myCode) {
          this.socket.emit('joinRoom', { code: this.myCode });
        }
      });

      const route = (name, cb) => {
        this.socket.on(name, (data) => { if (cb) cb(data); });
      };

      route('roomCreated', (d) => {
        this.myCode = d.code;
        this.myRole = d.role;
        this.inSession = true;
        this._cbs.onRoomCreated && this._cbs.onRoomCreated(d);
      });

      route('roomJoined', (d) => {
        this.myCode = d.code;
        this.myRole = d.role;
        this.inSession = true;
        this._cbs.onRoomJoined && this._cbs.onRoomJoined(d);
      });

      route('joinError', (d) => { this._cbs.onJoinError && this._cbs.onJoinError(d); });
      route('lobbyUpdate', (d) => { this._cbs.onLobbyUpdate && this._cbs.onLobbyUpdate(d); });
      route('gameStart', (d) => { this._cbs.onGameStart && this._cbs.onGameStart(d); });
      route('stateUpdate', (d) => { this._cbs.onStateUpdate && this._cbs.onStateUpdate(d); });
      route('pinStarted', (d) => { this._cbs.onPinStarted && this._cbs.onPinStarted(d); });
      route('pinBroken', (d) => { this._cbs.onPinBroken && this._cbs.onPinBroken(d); });
      route('struggleAttempt', (d) => { this._cbs.onStruggleAttempt && this._cbs.onStruggleAttempt(d); });
      route('clash', (d) => { this._cbs.onClash && this._cbs.onClash(d); });
      route('pointScored', (d) => { this._cbs.onPointScored && this._cbs.onPointScored(d); });
      route('matchOver', (d) => { this._cbs.onMatchOver && this._cbs.onMatchOver(d); });
      route('opponentLeft', (d) => { this._cbs.onOpponentLeft && this._cbs.onOpponentLeft(d); });
      route('chatMessage', (d) => { this._cbs.onChatMessage && this._cbs.onChatMessage(d); });
      route('rematchUpdate', (d) => { this._cbs.onRematchUpdate && this._cbs.onRematchUpdate(d); });
    },

    ensureConnected() {
      if (this.socket && !this.socket.connected) this.socket.connect();
    },

    createRoom(role) { this.ensureConnected(); this.socket.emit('createRoom', { role }); },
    joinRoom(code) { this.ensureConnected(); this.socket.emit('joinRoom', { code }); },
    press() { if (this.socket && this.socket.connected && this.inSession) this.socket.emit('press'); },
    release() { if (this.socket && this.socket.connected && this.inSession) this.socket.emit('release'); },
    rematch() { if (this.socket && this.socket.connected && this.inSession) this.socket.emit('rematch'); },
    noRematch() { if (this.socket && this.socket.connected && this.inSession) this.socket.emit('noRematch'); },
    sendChat(text) { if (this.socket && this.socket.connected && this.inSession) this.socket.emit('chat', { text }); },

    leaveToHome() {
      this.inSession = false;
      this.myCode = null;
      this.myRole = null;
      if (this.socket) {
        this.socket.disconnect(true);
        this.ensureConnected();
      }
    }
  };

  global.SocketClient = SocketClient;
})(window);
