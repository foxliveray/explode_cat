import { v4 as uuidv4 } from 'uuid';
import { Room, RoomPlayer, RoomSettings } from '../types/game';

const DEFAULT_SETTINGS: RoomSettings = {
  expansions: {
    implodingKittens: true,
    streakingKittens: true,
  },
  nopeWindowSeconds: 5,
  turnTimeoutSeconds: 60,
};

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerRooms: Map<string, string> = new Map(); // playerId -> roomId
  private socketToPlayer: Map<string, string> = new Map(); // socketId -> playerId

  // Generate a 6-character room code
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure unique
    if (this.getRoomByCode(code)) {
      return this.generateRoomCode();
    }
    return code;
  }

  // Create a new room
  createRoom(hostSocketId: string, hostName: string, settings?: Partial<RoomSettings>): Room {
    const roomId = uuidv4();
    const playerId = uuidv4();
    const roomCode = this.generateRoomCode();

    const host: RoomPlayer = {
      id: playerId,
      name: hostName,
      socketId: hostSocketId,
      isHost: true,
      isReady: true,
    };

    const room: Room = {
      id: roomId,
      code: roomCode,
      hostId: playerId,
      players: [host],
      maxPlayers: 10,
      isGameStarted: false,
      gameState: null,
      settings: { ...DEFAULT_SETTINGS, ...settings },
      createdAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    this.playerRooms.set(playerId, roomId);
    this.socketToPlayer.set(hostSocketId, playerId);

    return room;
  }

  // Join an existing room
  joinRoom(roomCode: string, socketId: string, playerName: string): { room: Room; playerId: string } | null {
    const room = this.getRoomByCode(roomCode);
    if (!room) return null;
    if (room.isGameStarted) return null;
    if (room.players.length >= room.maxPlayers) return null;

    const playerId = uuidv4();
    const player: RoomPlayer = {
      id: playerId,
      name: playerName,
      socketId,
      isHost: false,
      isReady: false,
    };

    room.players.push(player);
    this.playerRooms.set(playerId, room.id);
    this.socketToPlayer.set(socketId, playerId);

    return { room, playerId };
  }

  // Leave a room
  leaveRoom(socketId: string): { room: Room; playerId: string; wasHost: boolean } | null {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return null;

    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return null;

    const wasHost = room.players[playerIndex].isHost;
    room.players.splice(playerIndex, 1);

    this.playerRooms.delete(playerId);
    this.socketToPlayer.delete(socketId);

    // If room is empty, delete it
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return { room, playerId, wasHost };
    }

    // If host left, assign new host
    if (wasHost && room.players.length > 0) {
      room.players[0].isHost = true;
      room.hostId = room.players[0].id;
    }

    return { room, playerId, wasHost };
  }

  // Get room by code
  getRoomByCode(code: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.code === code.toUpperCase()) {
        return room;
      }
    }
    return undefined;
  }

  // Get room by player
  getRoomByPlayerId(playerId: string): Room | undefined {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  // Get room by socket
  getRoomBySocketId(socketId: string): Room | undefined {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return undefined;
    return this.getRoomByPlayerId(playerId);
  }

  // Get player by socket
  getPlayerBySocketId(socketId: string): { player: RoomPlayer; room: Room } | undefined {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return undefined;

    const room = this.getRoomByPlayerId(playerId);
    if (!room) return undefined;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return undefined;

    return { player, room };
  }

  // Update player socket ID (for reconnection)
  updatePlayerSocket(playerId: string, oldSocketId: string, newSocketId: string): boolean {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return false;

    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return false;

    // Update socket mapping
    this.socketToPlayer.delete(oldSocketId);
    this.socketToPlayer.set(newSocketId, playerId);
    player.socketId = newSocketId;

    return true;
  }

  // Find player by ID in any room
  getPlayerById(playerId: string): { player: RoomPlayer; room: Room } | undefined {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return undefined;

    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return undefined;

    return { player, room };
  }

  // Find player by name in a specific room
  getPlayerByNameInRoom(roomCode: string, playerName: string): { player: RoomPlayer; room: Room } | undefined {
    const room = this.getRoomByCode(roomCode);
    if (!room) return undefined;

    const player = room.players.find(p => p.name === playerName);
    if (!player) return undefined;

    return { player, room };
  }

  // Update player ready status
  setPlayerReady(socketId: string, isReady: boolean): Room | null {
    const result = this.getPlayerBySocketId(socketId);
    if (!result) return null;

    result.player.isReady = isReady;
    return result.room;
  }

  // Update room settings
  updateSettings(socketId: string, settings: Partial<RoomSettings>): Room | null {
    const result = this.getPlayerBySocketId(socketId);
    if (!result || !result.player.isHost) return null;

    result.room.settings = { ...result.room.settings, ...settings };
    return result.room;
  }

  // Kick a player
  kickPlayer(hostSocketId: string, targetPlayerId: string): { room: Room; kickedSocketId: string } | null {
    const hostResult = this.getPlayerBySocketId(hostSocketId);
    if (!hostResult || !hostResult.player.isHost) return null;

    const targetPlayer = hostResult.room.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer || targetPlayer.isHost) return null;

    const kickedSocketId = targetPlayer.socketId;
    const targetIndex = hostResult.room.players.findIndex(p => p.id === targetPlayerId);
    hostResult.room.players.splice(targetIndex, 1);

    this.playerRooms.delete(targetPlayerId);
    this.socketToPlayer.delete(kickedSocketId);

    return { room: hostResult.room, kickedSocketId };
  }

  // Check if all players are ready (host doesn't need to be ready)
  areAllPlayersReady(room: Room): boolean {
    const nonHostPlayers = room.players.filter(p => !p.isHost);
    return room.players.length >= 2 && nonHostPlayers.every(p => p.isReady);
  }

  // Get room count
  getRoomCount(): number {
    return this.rooms.size;
  }

  // Clean up old rooms (call periodically)
  cleanupOldRooms(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      if (!room.isGameStarted && now - room.createdAt > maxAgeMs) {
        for (const player of room.players) {
          this.playerRooms.delete(player.id);
          this.socketToPlayer.delete(player.socketId);
        }
        this.rooms.delete(roomId);
      }
    }
  }
}
