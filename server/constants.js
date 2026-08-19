'use strict';

/**
 * All tunable numbers for the game. Single source of truth —
 * change timing here, not scattered through gameLogic.js.
 */
module.exports = {
  // Continuous hold needed (server-side, millis) to score a pin.
  PIN_DURATION_MS: 1800,

  // Presses this close together (server receive-time, millis) are a
  // neutral clash: no pinner is assigned, neither player is trapped.
  SIMULTANEOUS_THRESHOLD_MS: 60,

  // While a pin is active the server emits a stateUpdate this often so the
  // progress ring animates. Purely cosmetic; the server remains the clock.
  PIN_TICK_MS: 100,

  // First player to this score wins the match (default when the creator
  // doesn't pick a custom match length).
  POINTS_TO_WIN: 5,

  // Match lengths the room creator may choose from.
  ALLOWED_MATCH_LENGTHS: [3, 5, 7, 9],

  MAX_PLAYERS_PER_ROOM: 2,
  ROOM_CODE_LENGTH: 4,

  // Grace period (millis) a room survives after a player disconnects,
  // in case they reconnect.
  ROOM_CLEANUP_GRACE_MS: 30000
};
