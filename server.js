const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.get('/', (req, res) => {
    res.send('A szerver mukodik Renderen!');
});

const rooms = {};

function broadcastRoomList() {
    const availableRooms = [];
    for (const [id, data] of Object.entries(rooms)) {
        if (!data.p2) {
            availableRooms.push(id);
        }
    }
    io.emit('roomListUpdate', availableRooms);
}

io.on('connection', (socket) => {
    console.log('Játékos csatlakozott:', socket.id);
    broadcastRoomList();

    socket.on('joinGame', (roomId) => {
        if (!rooms[roomId]) {
            rooms[roomId] = {
                p1: socket.id, p2: null,
                p1Bomb: null, p2Bomb: null,
                turn: 'p1',
                boardP1: Array(9).fill(false), boardP2: Array(9).fill(false)
            };
            socket.join(roomId);
            socket.emit('playerAssigned', { role: 'p1' });
            broadcastRoomList();
        } else {
            const room = rooms[roomId];
            if (!room.p2) {
                room.p2 = socket.id;
                socket.join(roomId);
                socket.emit('playerAssigned', { role: 'p2' });
                io.to(roomId).emit('gamePhase', 'setup');
                broadcastRoomList();
            } else {
                socket.emit('errorMsg', 'Ez a szoba már tele van!');
            }
        }
    });

    socket.on('setBomb', ({ roomId, index }) => {
        const room = rooms[roomId];
        if (!room) return;
        if (socket.id === room.p1) room.p1Bomb = index;
        else if (socket.id === room.p2) room.p2Bomb = index;

        if (room.p1Bomb !== null && room.p2Bomb !== null) {
            io.to(roomId).emit('gamePhase', 'play');
            io.to(roomId).emit('updateTurn', room.turn);
        } else {
             socket.emit('waitingForOpponent');
        }
    });

    socket.on('makeMove', ({ roomId, index }) => {
        const room = rooms[roomId];
        if (!room) return;
        if ((room.turn === 'p1' && socket.id !== room.p1) || (room.turn === 'p2' && socket.id !== room.p2)) return; 

        let exploded = false;
        if (room.turn === 'p1') {
            if (index === room.p2Bomb) { exploded = true; io.to(roomId).emit('gameOver', { winner: 'p2' }); }
            else { room.boardP1[index] = true; room.turn = 'p2'; }
        } else {
            if (index === room.p1Bomb) { exploded = true; io.to(roomId).emit('gameOver', { winner: 'p1' }); }
            else { room.boardP2[index] = true; room.turn = 'p1'; }
        }

        if (!exploded) {
            io.to(roomId).emit('moveMade', { index, player: socket.id === room.p1 ? 'p1' : 'p2' });
            io.to(roomId).emit('updateTurn', room.turn);
        }
    });

    socket.on('disconnect', () => {
        for (const [id, data] of Object.entries(rooms)) {
            if (data.p1 === socket.id || data.p2 === socket.id) {
                delete rooms[id];
            }
        }
        broadcastRoomList();
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Szerver fut a ${port}-on`);
});
