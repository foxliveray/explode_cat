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
  playNope: (cardId: string) => void;
  passNope: () => void;
  selectPlayer: (playerId: string) => void;
  selectCardName: (cardType: CardType) => void;
  giveCard: (cardId: string) => void;
  selectCardFromDiscard: (cardId: string) => void;
  selectCardForGarbage: (cardId: string) => void;
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
      // 重连配置
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log('Connected to server');
      set({ isConnected: true });
      
      // 尝试恢复之前的 session
      const savedSession = sessionStorage.getItem('gameSession');
      if (savedSession) {
        try {
          const session = JSON.parse(savedSession);
          console.log('Attempting to rejoin room:', session.roomCode);
          socket.emit('room:rejoin', {
            roomCode: session.roomCode,
            playerName: session.playerName,
            playerId: session.playerId,
          });
        } catch (e) {
          console.error('Failed to parse saved session:', e);
          sessionStorage.removeItem('gameSession');
        }
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      set({ isConnected: false });
      
      // 如果是传输错误，socket.io 会自动重连
      if (reason === 'io server disconnect') {
        // 服务器主动断开，不自动重连
        sessionStorage.removeItem('gameSession');
      }
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
      set({ room, gameState: null });
      // 保存 session 用于重连
      const { playerId } = get();
      sessionStorage.setItem('gameSession', JSON.stringify({
        roomCode: room.code,
        playerName: room.players.find((p: any) => p.id === playerId)?.name,
        playerId,
      }));
    });

    socket.on('room:joined', (room) => {
      set({ room, gameState: null });
      // 保存 session 用于重连
      const { playerId } = get();
      sessionStorage.setItem('gameSession', JSON.stringify({
        roomCode: room.code,
        playerName: room.players.find((p: any) => p.id === playerId)?.name,
        playerId,
      }));
    });

    socket.on('room:updated', (room) => {
      set({ room });
    });

    socket.on('room:kicked', () => {
      set({ room: null, error: 'You have been kicked from the room' });
      sessionStorage.removeItem('gameSession');
    });
    
    // 重连成功
    socket.on('room:rejoined', (data) => {
      console.log('Successfully rejoined room');
      set({ 
        room: data.room, 
        gameState: data.gameState || null,
        playerId: data.playerId,
      });
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
      sessionStorage.removeItem('gameSession');
    });

    // 监听页面可见性变化，手机切换应用时触发
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !socket.connected) {
        console.log('Page visible, attempting reconnect...');
        socket.connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 保存清理函数以便断开时移除监听
    (socket as any)._visibilityHandler = handleVisibilityChange;

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

  playNope: (cardId: string) => {
    const { socket } = get();
    socket?.emit('game:nope', cardId);
  },

  passNope: () => {
    const { socket } = get();
    socket?.emit('game:passNope');
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

  selectCardForGarbage: (cardId: string) => {
    const { socket } = get();
    socket?.emit('action:selectCardForGarbage', cardId);
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
