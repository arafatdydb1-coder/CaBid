'use strict';

const {
  PIN_DURATION_MS,
  PIN_TICK_MS,
  SIMULTANEOUS_THRESHOLD_MS,
  POINTS_TO_WIN
} = require('./constants');
const { otherRole } = require('./rooms');

/**
 * Sanitized, render-ready projection of a room for client broadcasts.
 * The client never makes a decision from this — it only draws what it sees.
 */
function serializeRoom(room, ts) {
  const cat = room.players.cat || { handState: 'up', score: 0, connected: false };
  const bird = room.players.bird || { handState: 'up', score: 0, connected: false };
  const pinnerRole = room.pinnerRole;
  return {
    cat: {
      handState: cat.handState,
      score: cat.score,
      connected: cat.connected
    },
    bird: {
      handState: bird.handState,
      score: bird.score,
      connected: bird.connected
    },
    pinnerRole,
    pinProgressMs: pinnerRole && room.pinStartTs != null
      ? Math.max(0, Math.min(PIN_DURATION_MS, ts - room.pinStartTs))
      : 0
  };
}

function clearPin(room) {
  if (room.pinTimer) {
    clearTimeout(room.pinTimer);
    room.pinTimer = null;
  }
  if (room.pinTick) {
    clearInterval(room.pinTick);
    room.pinTick = null;
  }
}

/**
 * A pin just completed server-side (the 1.8s timer fired untouched).
 */
function completePin(io, room) {
  clearPin(room);
  if (!room.pinnerRole) return;

  const winner = room.pinnerRole;
  room.players[winner].score += 1;
  const scores = { cat: room.players.cat.score, bird: room.players.bird.score };

  room.pinnerRole = null;
  room.pinStartTs = null;
  room.players.cat.handState = 'up';
  room.players.bird.handState = 'up';

  if (room.players[winner].score >= POINTS_TO_WIN) {
    room.over = true;
    io.to(room.code).emit('matchOver', { winner, scores });
  } else {
    io.to(room.code).emit('pointScored', { winner, scores });
    io.to(room.code).emit('stateUpdate', serializeRoom(room, Date.now()));
  }
}

function startPinTimer(io, room) {
  if (room.pinTimer) clearTimeout(room.pinTimer);
  room.pinTimer = setTimeout(() => completePin(io, room), PIN_DURATION_MS);
}

function startPin(io, room, role, ts) {
  room.pinnerRole = role;
  room.pinStartTs = ts;
  io.to(room.code).emit('pinStarted', { pinner: role });
  startPinTimer(io, room);
  room.pinTick = setInterval(() => {
    io.to(room.code).emit('stateUpdate', serializeRoom(room, Date.now()));
  }, PIN_TICK_MS);
}

/**
 * Server-authoritative `press`. ts must be Date.now() captured on receipt.
 */
function handlePress(io, room, role, ts) {
  const other = otherRole(role);
  if (room.players[role].handState === 'down') return;

  room.players[role].handState = 'down';
  room.players[role].lastDownTs = ts;

  if (room.players[other].handState === 'down' && room.pinnerRole === null) {
    if (ts - room.players[other].lastDownTs < SIMULTANEOUS_THRESHOLD_MS) {
      // Neutral clash: both hands down, neither trapped, no pinner.
      io.to(room.code).emit('clash', {});
    } else {
      startPin(io, room, role, ts);
    }
  }

  io.to(room.code).emit('stateUpdate', serializeRoom(room, ts));
}

/**
 * Server-authoritative `release`. ts must be Date.now() captured on receipt.
 */
function handleRelease(io, room, role, ts) {
  const other = otherRole(role);

  if (role === room.pinnerRole) {
    // The pinner let go early: escape. The trapped opponent is NOT auto-moved.
    const heldMs = ts - room.pinStartTs;
    clearPin(room);
    room.pinnerRole = null;
    room.pinStartTs = null;
    room.players[role].handState = 'up';
    io.to(room.code).emit('pinBroken', { by: role, heldMs });
    io.to(room.code).emit('stateUpdate', serializeRoom(room, ts));
  } else if (other === room.pinnerRole) {
    // Currently pinned: release is physically ignored, hand stays down.
    io.to(room.code).emit('struggleAttempt', { by: role });
  } else {
    // Normal release, no pin involved.
    room.players[role].handState = 'up';
    io.to(room.code).emit('stateUpdate', serializeRoom(room, ts));
  }
}

/**
 * Reset a room for a fresh match (rematch, or re-join of a finished room).
 */
function resetMatch(room) {
  clearPin(room);
  room.pinnerRole = null;
  room.pinStartTs = null;
  for (const role of ['cat', 'bird']) {
    if (room.players[role]) {
      room.players[role].handState = 'up';
      room.players[role].lastDownTs = null;
      room.players[role].score = 0;
    }
  }
  room.started = true;
  room.over = false;
}

module.exports = {
  serializeRoom,
  handlePress,
  handleRelease,
  clearPin,
  resetMatch,
  startPin
};
