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
  io.to(room.players.cat.socketId).emit('gameStart', { yourRole: 'cat' });
  io.to(room.players.bird.socketId).emit('gameStart', { yourRole: 'bird' });
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
  socket.on('createRoom', () => {
    removeSocketFromRoom(socket);
    const room = rooms.createRoom();
    rooms.addPlayer(room, socket.id, 'cat');
    socket.join(room.code);
    socket.emit('roomCreated', { code: room.code });
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

  socket.on('rematch', () => {
    const room = rooms.findRoomBySocketId(socket.id);
    if (!room || !room.over) return;
    startGameForRoom(room);
  });

  socket.on('disconnect', () => {
    removeSocketFromRoom(socket);
  });
});

server.listen(PORT, () => {
  console.log(`CaBid listening on http://localhost:${PORT}`);
});
