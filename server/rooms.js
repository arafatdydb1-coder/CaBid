'use strict';

const { ROOM_CODE_LENGTH } = require('./constants');

// In-memory room registry. Ephemeral by design — rooms are lost on restart.
const rooms = new Map();

const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRoomCode() {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

/**
 * Create a fresh room. Returns the room object.
 */
function createRoom() {
  const code = generateRoomCode();
  const room = {
    code,
    players: {
      cat: null,
      bird: null
    },
    pinnerRole: null,
    pinStartTs: null,
    pinTimer: null,
    pinTick: null,
    started: false,
    over: false,
    cleanupTimer: null,
    // Ephemeral, in-memory chat. Cleared when the match ends.
    messages: [],
    // Both players must vote 'yes' to rematch. null = not decided yet.
    rematchVotes: {
      cat: null,
      bird: null
    }
  };
  rooms.set(code, room);
  return room;
}

/**
 * Assign a role to a socket in the room.
 * Role is 'cat' for the host (creator), 'bird' for the joiner.
 */
function addPlayer(room, socketId, role) {
  room.players[role] = {
    socketId,
    connected: true,
    handState: 'up',
    lastDownTs: null,
    score: 0
  };
}

/**
 * Find the room a socket currently belongs to (by socket id).
 */
function findRoomBySocketId(socketId) {
  for (const room of rooms.values()) {
    if (room.players.cat && room.players.cat.socketId === socketId) return room;
    if (room.players.bird && room.players.bird.socketId === socketId) return room;
  }
  return null;
}

/**
 * Find the role ('cat' | 'bird' | null) a socket holds within a room.
 */
function roleOf(room, socketId) {
  if (room.players.cat && room.players.cat.socketId === socketId) return 'cat';
  if (room.players.bird && room.players.bird.socketId === socketId) return 'bird';
  return null;
}

function otherRole(role) {
  return role === 'cat' ? 'bird' : 'cat';
}

function getRoom(code) {
  return rooms.get((code || '').trim().toUpperCase()) || null;
}

function deleteRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.pinTimer) {
    clearTimeout(room.pinTimer);
    room.pinTimer = null;
  }
  if (room.pinTick) {
    clearInterval(room.pinTick);
    room.pinTick = null;
  }
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }
  rooms.delete(code);
}

module.exports = {
  rooms,
  createRoom,
  addPlayer,
  findRoomBySocketId,
  roleOf,
  otherRole,
  getRoom,
  deleteRoom
};
