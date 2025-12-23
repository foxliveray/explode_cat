import { Server, Socket } from 'socket.io';
import { RoomManager } from '../room/RoomManager';
import { GameEngine } from '../game/GameEngine';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  RoomData,
} from '../types/events';
import { RoomSettings, Room } from '../types/game';
import { CardType } from '../types/cards';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export class SocketHandler {
  private io: TypedServer;
  private roomManager: RoomManager;
  private games: Map<string, GameEngine> = new Map();

  constructor(io: TypedServer, roomManager: RoomManager) {
    this.io = io;
    this.roomManager = roomManager;
  }

  start(): void {
    this.io.on('connection', (socket: TypedSocket) => {
      console.log(`Client connected: ${socket.id}`);

      // Send connection confirmation
      socket.emit('connected', { playerId: socket.id });

      // Room events
      socket.on('room:create', (data) => this.handleCreateRoom(socket, data));
      socket.on('room:join', (data) => this.handleJoinRoom(socket, data));
      socket.on('room:leave', () => this.handleLeaveRoom(socket));
      socket.on('room:ready', (isReady) => this.handleReady(socket, isReady));
      socket.on('room:updateSettings', (settings) => this.handleUpdateSettings(socket, settings));
      socket.on('room:kick', (playerId) => this.handleKick(socket, playerId));

      // Game events
      socket.on('game:start', () => this.handleStartGame(socket));
      socket.on('game:playCards', (cardIds) => this.handlePlayCards(socket, cardIds));
      socket.on('game:drawCard', () => this.handleDrawCard(socket));
      socket.on('game:drawFromBottom', () => this.handleDrawFromBottom(socket));

      // Action responses
      socket.on('action:selectPlayer', (playerId) => this.handleSelectPlayer(socket, playerId));
      socket.on('action:selectCardName', (cardType) => this.handleSelectCardName(socket, cardType));
      socket.on('action:giveCard', (cardId) => this.handleGiveCard(socket, cardId));
      socket.on('action:selectCardFromDiscard', (cardId) => this.handleSelectFromDiscard(socket, cardId));
      socket.on('action:placeExplodingKitten', (position) => this.handlePlaceExplodingKitten(socket, position));
      socket.on('action:reorderCards', (cardIds) => this.handleReorderCards(socket, cardIds));
      socket.on('action:dismissViewCards', () => this.handleDismissViewCards(socket));

      // Disconnect
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });

    // Cleanup old rooms every hour
    setInterval(() => this.roomManager.cleanupOldRooms(), 3600000);
  }

  private getRoomData(room: Room): RoomData {
    return {
      code: room.code,
      hostId: room.hostId,
      players: room.players,
      maxPlayers: room.maxPlayers,
      isGameStarted: room.isGameStarted,
      settings: room.settings,
    };
  }

  // Handle room creation
  private handleCreateRoom(socket: TypedSocket, data: { playerName: string; settings?: Partial<RoomSettings> }): void {
    const room = this.roomManager.createRoom(socket.id, data.playerName, data.settings);
    socket.join(room.id);
    socket.emit('room:created', {
      roomCode: room.code,
      room: this.getRoomData(room),
    });
    console.log(`Room created: ${room.code} by ${data.playerName}`);
  }

  // Handle joining room
  private handleJoinRoom(socket: TypedSocket, data: { roomCode: string; playerName: string }): void {
    const result = this.roomManager.joinRoom(data.roomCode, socket.id, data.playerName);
    
    if (!result) {
      socket.emit('error', 'Could not join room. Room may be full, not found, or game already started.');
      return;
    }

    const { room } = result;
    socket.join(room.id);
    socket.emit('room:joined', this.getRoomData(room));
    
    // Notify others
    socket.to(room.id).emit('room:updated', this.getRoomData(room));
    console.log(`${data.playerName} joined room ${room.code}`);
  }

  // Handle leaving room
  private handleLeaveRoom(socket: TypedSocket): void {
    const playerInfo = this.roomManager.getPlayerBySocketId(socket.id);
    if (!playerInfo) return;

    const { player, room } = playerInfo;
    
    // If game is in progress, mark player as dead/exploded
    const game = this.games.get(room.id);
    if (game && room.isGameStarted) {
      const result = game.playerQuit(player.id);
      
      if (result) {
        // Notify other players about the quit
        this.io.to(room.id).emit('game:exploded', {
          playerId: player.id,
          playerName: player.name,
        });
        
        // Check if game is over
        const state = game.getState();
        if (state.phase === 'game_over' && state.winner) {
          // Broadcast final game state so frontend can update
          this.broadcastGameState(room.id, game);
          this.io.to(room.id).emit('game:over', {
            winnerId: state.winner.id,
            winnerName: state.winner.name,
          });
        } else {
          // Broadcast updated state
          this.broadcastGameState(room.id, game);
          
          // Notify next player
          const currentPlayer = game.getCurrentPlayer();
          if (currentPlayer) {
            const currentSocket = this.io.sockets.sockets.get(currentPlayer.socketId);
            if (currentSocket) {
              currentSocket.emit('game:yourTurn');
            }
          }
        }
      }
    }

    // Remove from room
    const result = this.roomManager.leaveRoom(socket.id);
    if (!result) return;

    socket.leave(result.room.id);
    
    if (result.room.players.length > 0) {
      this.io.to(result.room.id).emit('room:updated', this.getRoomData(result.room));
    }
    console.log(`Player ${player.name} left room ${result.room.code}`);
  }

  // Handle ready status
  private handleReady(socket: TypedSocket, isReady: boolean): void {
    const room = this.roomManager.setPlayerReady(socket.id, isReady);
    if (!room) return;

    this.io.to(room.id).emit('room:updated', this.getRoomData(room));
  }

  // Handle settings update
  private handleUpdateSettings(socket: TypedSocket, settings: Partial<RoomSettings>): void {
    const room = this.roomManager.updateSettings(socket.id, settings);
    if (!room) {
      socket.emit('error', 'Only host can update settings');
      return;
    }

    this.io.to(room.id).emit('room:updated', this.getRoomData(room));
  }

  // Handle kicking player
  private handleKick(socket: TypedSocket, playerId: string): void {
    const result = this.roomManager.kickPlayer(socket.id, playerId);
    if (!result) {
      socket.emit('error', 'Cannot kick player');
      return;
    }

    const kickedSocket = this.io.sockets.sockets.get(result.kickedSocketId);
    if (kickedSocket) {
      kickedSocket.emit('room:kicked');
      kickedSocket.leave(result.room.id);
    }

    this.io.to(result.room.id).emit('room:updated', this.getRoomData(result.room));
  }

  // Handle starting game
  private handleStartGame(socket: TypedSocket): void {
    const playerInfo = this.roomManager.getPlayerBySocketId(socket.id);
    if (!playerInfo) return;

    const { player, room } = playerInfo;
    
    if (!player.isHost) {
      socket.emit('error', 'Only host can start the game');
      return;
    }

    if (room.players.length < 2) {
      socket.emit('error', 'Need at least 2 players to start');
      return;
    }

    if (!this.roomManager.areAllPlayersReady(room)) {
      socket.emit('error', 'Not all players are ready');
      return;
    }

    // Create game
    const game = new GameEngine(room.id, room.players, room.settings);
    this.games.set(room.id, game);
    room.isGameStarted = true;

    // Notify room that game started (so Room.tsx can detect isGameStarted change)
    this.io.to(room.id).emit('room:updated', this.getRoomData(room));

    // Send initial game state to each player
    for (const p of room.players) {
      const pSocket = this.io.sockets.sockets.get(p.socketId);
      if (pSocket) {
        pSocket.emit('game:started', game.getClientState(p.id));
      }
    }

    // Notify current player
    const currentPlayer = game.getCurrentPlayer();
    const currentSocket = this.io.sockets.sockets.get(currentPlayer.socketId);
    if (currentSocket) {
      currentSocket.emit('game:yourTurn');
    }

    console.log(`Game started in room ${room.code}`);
  }

  // Handle playing cards
  private handlePlayCards(socket: TypedSocket, cardIds: string[]): void {
    const { game, player, room } = this.getGameContext(socket);
    if (!game || !player || !room) return;

    const result = game.playCards(player.id, cardIds);
    
    if (!result.success) {
      socket.emit('error', result.error || 'Cannot play cards');
      return;
    }

    // Broadcast card played
    const state = game.getState();
    this.io.to(room.id).emit('game:cardPlayed', {
      playerId: player.id,
      playerName: player.name,
      cardTypes: state.lastPlayedCards.map(c => c.type),
      comboType: result.comboType,
    });

    // Send updated state to all players
    this.broadcastGameState(room.id, game);

    // Handle pending actions
    if (result.needsTarget && state.pendingAction) {
      socket.emit('action:required', {
        type: state.pendingAction.type,
        message: this.getActionMessage(state.pendingAction.type),
        options: state.pendingAction.cards,
      });
    }
  }

  // Handle drawing card
  private handleDrawCard(socket: TypedSocket): void {
    const { game, player, room } = this.getGameContext(socket);
    if (!game || !player || !room) return;

    const result = game.drawCard(player.id);
    
    if (!result.success) {
      socket.emit('error', result.error || 'Cannot draw card');
      return;
    }

    // Broadcast card drawn
    this.io.to(room.id).emit('game:cardDrawn', {
      playerId: player.id,
      playerName: player.name,
      cardCount: 1,
    });

    if (result.exploded) {
      this.io.to(room.id).emit('game:exploded', {
        playerId: player.id,
        playerName: player.name,
      });
    }

    // Send updated state
    this.broadcastGameState(room.id, game);

    // Check for defusing
    const state = game.getState();
    if (state.pendingAction?.type === 'place_exploding_kitten') {
      socket.emit('game:defused', {
        playerId: player.id,
        playerName: player.name,
      });
      socket.emit('action:required', {
        type: state.pendingAction.type,
        message: 'Choose where to place the Exploding Kitten (0 = top)',
        options: { deckSize: state.deck.length },
      });
    }

    // Notify next player
    if (state.phase === 'playing') {
      const nextPlayer = game.getCurrentPlayer();
      const nextSocket = this.io.sockets.sockets.get(nextPlayer.socketId);
      if (nextSocket) {
        nextSocket.emit('game:yourTurn');
      }
    }

    // Check for game over
    if (state.phase === 'game_over' && state.winner) {
      this.io.to(room.id).emit('game:over', {
        winnerId: state.winner.id,
        winnerName: state.winner.name,
      });
    }
  }

  // Handle draw from bottom
  private handleDrawFromBottom(socket: TypedSocket): void {
    // Similar to handleDrawCard but from bottom
    const { game, player, room } = this.getGameContext(socket);
    if (!game || !player || !room) return;

    // This is handled by the Draw From Bottom card effect
    socket.emit('error', 'Draw from bottom is handled by the card effect');
  }

  // Handle select player action
  private handleSelectPlayer(socket: TypedSocket, targetId: string): void {
    const { game, player, room } = this.getGameContext(socket);
    if (!game || !player || !room) return;

    const result = game.selectPlayer(player.id, targetId);
    
    if (!result.success) {
      socket.emit('error', result.error || 'Cannot select player');
      return;
    }

    this.broadcastGameState(room.id, game);

    // Check for follow-up actions
    const state = game.getState();
    if (state.pendingAction) {
      const targetSocket = this.io.sockets.sockets.get(
        room.players.find(p => p.id === state.pendingAction!.playerId)?.socketId || ''
      );
      if (targetSocket) {
        targetSocket.emit('action:required', {
          type: state.pendingAction.type,
          message: this.getActionMessage(state.pendingAction.type),
        });
      }
    }
  }

  // Handle select card name (Three of a Kind)
  private handleSelectCardName(socket: TypedSocket, cardType: CardType): void {
    const { game, player, room } = this.getGameContext(socket);
    if (!game || !player || !room) return;

    const result = game.selectCardName(player.id, cardType);
    
    if (!result.success) {
      socket.emit('error', result.error || 'Cannot select card');
      return;
    }

    this.broadcastGameState(room.id, game);
  }

  // Handle give card (Favor)
  private handleGiveCard(socket: TypedSocket, cardId: string): void {
    const { game, player, room } = this.getGameContext(socket);
    if (!game || !player || !room) return;

    const result = game.giveCard(player.id, cardId);
    
    if (!result.success) {
      socket.emit('error', result.error || 'Cannot give card');
      return;
    }

    this.broadcastGameState(room.id, game);
  }

  // Handle select from discard (Five Different)
  private handleSelectFromDiscard(socket: TypedSocket, cardId: string): void {
    const { game, player, room } = this.getGameContext(socket);
    if (!game || !player || !room) return;

    const result = game.selectCardFromDiscard(player.id, cardId);
    
    if (!result.success) {
      socket.emit('error', result.error || 'Cannot select card');
      return;
    }

    this.broadcastGameState(room.id, game);
  }

  // Handle place exploding kitten
  private handlePlaceExplodingKitten(socket: TypedSocket, position: number): void {
    const { game, player, room } = this.getGameContext(socket);
    if (!game || !player || !room) return;

    const result = game.placeExplodingKitten(player.id, position);
    
    if (!result.success) {
      socket.emit('error', result.error || 'Cannot place card');
      return;
    }

    this.broadcastGameState(room.id, game);

    // Notify next player
    const currentPlayer = game.getCurrentPlayer();
    const currentSocket = this.io.sockets.sockets.get(currentPlayer.socketId);
    if (currentSocket) {
      currentSocket.emit('game:yourTurn');
    }
  }

  // Handle reorder cards (See/Alter the Future)
  private handleReorderCards(socket: TypedSocket, cardIds: string[]): void {
    const { game, player, room } = this.getGameContext(socket);
    if (!game || !player || !room) return;

    const result = game.reorderCards(player.id, cardIds);
    
    if (!result.success) {
      socket.emit('error', result.error || 'Cannot reorder cards');
      return;
    }

    this.broadcastGameState(room.id, game);
  }

  // Handle dismiss view cards (See the Future - just viewing, no reorder)
  private handleDismissViewCards(socket: TypedSocket): void {
    const { game, player, room } = this.getGameContext(socket);
    if (!game || !player || !room) return;

    const result = game.dismissViewCards(player.id);
    
    if (!result.success) {
      socket.emit('error', result.error || 'Cannot dismiss view');
      return;
    }

    this.broadcastGameState(room.id, game);
  }

  // Handle disconnect
  private handleDisconnect(socket: TypedSocket): void {
    console.log(`Client disconnected: ${socket.id}`);
    this.handleLeaveRoom(socket);
  }

  // Helper: Get game context
  private getGameContext(socket: TypedSocket): { game?: GameEngine; player?: any; room?: Room } {
    const playerInfo = this.roomManager.getPlayerBySocketId(socket.id);
    if (!playerInfo) {
      socket.emit('error', 'Not in a room');
      return {};
    }

    const { player, room } = playerInfo;
    const game = this.games.get(room.id);
    
    if (!game) {
      socket.emit('error', 'Game not started');
      return {};
    }

    return { game, player, room };
  }

  // Helper: Broadcast game state to all players
  private broadcastGameState(roomId: string, game: GameEngine): void {
    const room = this.roomManager.getRoomByCode(
      Array.from(this.games.entries()).find(([id]) => id === roomId)?.[0] || ''
    );
    
    const state = game.getState();
    for (const player of state.players) {
      const pSocket = this.io.sockets.sockets.get(player.socketId);
      if (pSocket) {
        pSocket.emit('game:stateUpdate', game.getClientState(player.id));
      }
    }
  }

  // Helper: Get action message
  private getActionMessage(type: string): string {
    const messages: Record<string, string> = {
      'select_player': 'Select a target player',
      'select_card_from_player': 'Select a card to steal',
      'select_card_name': 'Name the card you want',
      'select_card_from_discard': 'Select a card from the discard pile',
      'place_exploding_kitten': 'Choose where to place the Exploding Kitten',
      'reorder_cards': 'Reorder the cards (drag to rearrange)',
      'select_card_to_give': 'Select a card to give',
      'select_card_for_garbage': 'Select a card to put in the deck',
    };
    return messages[type] || 'Take action';
  }
}
