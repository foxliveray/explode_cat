import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, RoomData } from '@shared/types/events';
import type { ClientGameState } from '@shared/types/game';
import type { CardType } from '@shared/types/cards';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketState {
  socket: TypedSocket | null;
  isConnected: boolean;
  playerId: string | null;
  room: RoomData | null;
  gameState: ClientGameState | null;
  error: string | null;
  isMyTurn: boolean;
  
  // Actions
  connect: () => void;
  disconnect: () => void;
  
  // Room actions
  createRoom: (playerName: string, settings?: Partial<{ expansions: { implodingKittens: boolean; streakingKittens: boolean } }>) => void;
  joinRoom: (roomCode: string, playerName: string) => void;
  leaveRoom: () => void;
  setReady: (isReady: boolean) => void;
  startGame: () => void;
  
  // Game actions  
  playCards: (cardIds: string[]) => void;
  drawCard: () => void;
  selectPlayer: (playerId: string) => void;
  selectCardName: (cardType: CardType) => void;
  giveCard: (cardId: string) => void;
  selectCardFromDiscard: (cardId: string) => void;
  placeExplodingKitten: (position: number) => void;
  reorderCards: (cardIds: string[]) => void;
  dismissViewCards: () => void; // Confirm viewing cards (See the Future)
  
  // Setters
  setError: (error: string | null) => void;
  clearRoom: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  playerId: null,
  room: null,
  gameState: null,
  error: null,
  isMyTurn: false,
  
  connect: () => {
    // Production: use VITE_SERVER_URL env var
    // Development: use current hostname
    const serverUrl = import.meta.env.VITE_SERVER_URL || 
      `http://${window.location.hostname}:3001`;
    console.log('Connecting to server:', serverUrl);
    
    const socket: TypedSocket = io(serverUrl, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Connected to server');
      set({ isConnected: true });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      set({ isConnected: false });
    });

    socket.on('connected', ({ playerId }) => {
      set({ playerId });
    });

    socket.on('error', (message) => {
      set({ error: message });
      setTimeout(() => set({ error: null }), 5000);
    });

    // Room events
    socket.on('room:created', ({ room }) => {
      set({ room, gameState: null }); // Clear old gameState
    });

    socket.on('room:joined', (room) => {
      set({ room, gameState: null }); // Clear old gameState
    });

    socket.on('room:updated', (room) => {
      set({ room });
    });

    socket.on('room:kicked', () => {
      set({ room: null, error: 'You have been kicked from the room' });
    });

    // Game events
    socket.on('game:started', (gameState) => {
      set({ gameState });
    });

    socket.on('game:stateUpdate', (gameState) => {
      set({ gameState });
    });

    socket.on('game:yourTurn', () => {
      set({ isMyTurn: true });
    });

    socket.on('game:over', ({ winnerName }) => {
      set({ error: `Game Over! ${winnerName} wins!` });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  // Room actions
  createRoom: (playerName, settings) => {
    const { socket } = get();
    socket?.emit('room:create', { playerName, settings });
  },

  joinRoom: (roomCode, playerName) => {
    const { socket } = get();
    socket?.emit('room:join', { roomCode, playerName });
  },

  leaveRoom: () => {
    const { socket } = get();
    socket?.emit('room:leave');
    set({ room: null, gameState: null });
  },

  setReady: (isReady) => {
    const { socket } = get();
    socket?.emit('room:ready', isReady);
  },

  startGame: () => {
    const { socket } = get();
    socket?.emit('game:start');
  },

  // Game actions
  playCards: (cardIds) => {
    const { socket } = get();
    socket?.emit('game:playCards', cardIds);
    set({ isMyTurn: false });
  },

  drawCard: () => {
    const { socket } = get();
    socket?.emit('game:drawCard');
    set({ isMyTurn: false });
  },

  selectPlayer: (playerId) => {
    const { socket } = get();
    socket?.emit('action:selectPlayer', playerId);
  },

  selectCardName: (cardType) => {
    const { socket } = get();
    socket?.emit('action:selectCardName', cardType);
  },

  giveCard: (cardId) => {
    const { socket } = get();
    socket?.emit('action:giveCard', cardId);
  },

  selectCardFromDiscard: (cardId) => {
    const { socket } = get();
    socket?.emit('action:selectCardFromDiscard', cardId);
  },

  placeExplodingKitten: (position) => {
    const { socket } = get();
    socket?.emit('action:placeExplodingKitten', position);
  },

  reorderCards: (cardIds) => {
    const { socket } = get();
    socket?.emit('action:reorderCards', cardIds);
  },

  dismissViewCards: () => {
    const { socket } = get();
    socket?.emit('action:dismissViewCards');
  },

  setError: (error) => set({ error }),
  
  clearRoom: () => set({ room: null, gameState: null }),
}));
