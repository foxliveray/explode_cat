import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { SocketHandler } from './socket/SocketHandler';
import { RoomManager } from './room/RoomManager';

const app = express();
const httpServer = createServer(app);

// Configure CORS - allow all origins for LAN access
app.use(cors({
  origin: true, // Allow any origin
  credentials: true,
}));

app.use(express.json());

// Create Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: true, // Allow any origin for LAN access
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Initialize managers
const roomManager = new RoomManager();
const socketHandler = new SocketHandler(io, roomManager);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: roomManager.getRoomCount() });
});

// Get room info
app.get('/api/rooms/:code', (req, res) => {
  const room = roomManager.getRoomByCode(req.params.code);
  if (room) {
    res.json({
      code: room.code,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      isGameStarted: room.isGameStarted,
    });
  } else {
    res.status(404).json({ error: 'Room not found' });
  }
});

// Start socket handler
socketHandler.start();

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 Exploding Kittens server running on port ${PORT}`);
});

export { io, roomManager };
