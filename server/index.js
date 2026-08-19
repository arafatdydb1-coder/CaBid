'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const constants = require('./constants');
const rooms = require('./rooms');
const gameLogic = require('./gameLogic');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const io = new Server(server);

function scheduleCleanup(room) {
  if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  room.cleanupTimer = setTimeout(() => {
    room.cleanupTimer = null;
    const catConnected = room.players.cat && room.players.cat.connected;
    const birdConnected = room.players.bird && room.players.bird.connected;
    if (!catConnected || !birdConnected) {
      rooms.deleteRoom(room.code);
    }
  }, constants.ROOM_CLEANUP_GRACE_MS);
}

function startGameForRoom(room) {
  gameLogic.resetMatch(room);
  io.to(room.players.cat.socketId).emit('gameStart', { yourRole: 'cat', pointsToWin: room.pointsToWin });
  io.to(room.players.bird.socketId).emit('gameStart', { yourRole: 'bird', pointsToWin: room.pointsToWin });
  io.to(room.code).emit('stateUpdate', gameLogic.serializeRoom(room, Date.now()));
}

function removeSocketFromRoom(socket) {
  const room = rooms.findRoomBySocketId(socket.id);
  if (!room) return;
  const role = rooms.roleOf(room, socket.id);
  if (!role) return;
  if (room.players[role]) room.players[role].connected = false;
  gameLogic.clearPin(room);
  socket.leave(room.code);
  io.to(room.code).emit('opponentLeft', {});
  scheduleCleanup(room);
}

io.on('connection', (socket) => {
  socket.on('createRoom', (payload) => {
    removeSocketFromRoom(socket);
    // The creator picks which side they play (cat or bird); the joiner
    // automatically gets the other side.
    let role = ((payload && payload.role) || 'cat').toLowerCase();
    if (role !== 'cat' && role !== 'bird') role = 'cat';
    const pointsToWin = (payload && payload.pointsToWin) || constants.POINTS_TO_WIN;
    const room = rooms.createRoom(pointsToWin);
    rooms.addPlayer(room, socket.id, role);
    socket.join(room.code);
    socket.emit('roomCreated', { code: room.code, role, pointsToWin: room.pointsToWin });
    io.to(room.code).emit('lobbyUpdate', { playersConnected: 1 });
  });

  socket.on('joinRoom', (payload) => {
    const code = ((payload && payload.code) || '').trim().toUpperCase();
    const room = rooms.getRoom(code);
    if (!room) {
      socket.emit('joinError', { message: 'Room not found. Check the code.' });
      return;
    }
    const catConnected = room.players.cat && room.players.cat.connected;
    const birdConnected = room.players.bird && room.players.bird.connected;
    if (catConnected && birdConnected) {
      socket.emit('joinError', { message: 'Room is full.' });
      return;
    }
    removeSocketFromRoom(socket);

    let role = 'bird';
    if (room.players.bird && room.players.bird.connected) role = 'cat';

    if (room.players[role]) {
      room.players[role].socketId = socket.id;
      room.players[role].connected = true;
      room.players[role].handState = 'up';
      room.players[role].lastDownTs = null;
    } else {
      rooms.addPlayer(room, socket.id, role);
    }

    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }

    socket.join(room.code);
    socket.emit('roomJoined', { code: room.code, role });
    io.to(room.code).emit('lobbyUpdate', { playersConnected: 2 });

    if (room.players.cat.connected && room.players.bird.connected) {
      startGameForRoom(room);
    }
  });

  socket.on('press', () => {
    const room = rooms.findRoomBySocketId(socket.id);
    if (!room || !room.started || room.over) return;
    const role = rooms.roleOf(room, socket.id);
    if (!role) return;
    gameLogic.handlePress(io, room, role, Date.now());
  });

  socket.on('release', () => {
    const room = rooms.findRoomBySocketId(socket.id);
    if (!room || !room.started || room.over) return;
    const role = rooms.roleOf(room, socket.id);
    if (!role) return;
    gameLogic.handleRelease(io, room, role, Date.now());
  });

  function broadcastRematch(room) {
    io.to(room.code).emit('rematchUpdate', {
      cat: room.rematchVotes.cat,
      bird: room.rematchVotes.bird
    });
  }

  // A player says they want a rematch. A rematch only starts when BOTH
  // players have voted 'yes' — nobody can force a second match.
  socket.on('rematch', () => {
    const room = rooms.findRoomBySocketId(socket.id);
    if (!room || !room.over) return;
    const role = rooms.roleOf(room, socket.id);
    if (!role) return;
    room.rematchVotes[role] = 'yes';
    broadcastRematch(room);
    if (room.rematchVotes.cat === 'yes' && room.rematchVotes.bird === 'yes') {
      startGameForRoom(room);
    }
  });

  // A player says they are not interested in a rematch.
  socket.on('noRematch', () => {
    const room = rooms.findRoomBySocketId(socket.id);
    if (!room || !room.over) return;
    const role = rooms.roleOf(room, socket.id);
    if (!role) return;
    room.rematchVotes[role] = 'no';
    broadcastRematch(room);
  });

  // Simple ephemeral chat. Messages live only in memory and are wiped
  // when the match ends.
  socket.on('chat', (payload) => {
    const room = rooms.findRoomBySocketId(socket.id);
    if (!room) return;
    const role = rooms.roleOf(room, socket.id);
    if (!role) return;
    const text = String((payload && payload.text) || '').trim().slice(0, 200);
    if (!text) return;
    const message = { role, text, ts: Date.now() };
    room.messages.push(message);
    if (room.messages.length > 50) room.messages.shift();
    io.to(room.code).emit('chatMessage', message);
  });

  socket.on('disconnect', () => {
    removeSocketFromRoom(socket);
  });
});

server.listen(PORT, () => {
  console.log(`CaBid listening on http://localhost:${PORT}`);
});
