import { Card, CardType, ComboType } from './cards';
import { ClientGameState, RoomPlayer, RoomSettings, PendingActionType } from './game';

// ==================== Client -> Server Events ====================

export interface ClientToServerEvents {
  // Room events
  'room:create': (data: { playerName: string; settings?: Partial<RoomSettings> }) => void;
  'room:join': (data: { roomCode: string; playerName: string }) => void;
  'room:leave': () => void;
  'room:ready': (isReady: boolean) => void;
  'room:updateSettings': (settings: Partial<RoomSettings>) => void;
  'room:kick': (playerId: string) => void;
  
  // Game events
  'game:start': () => void;
  'game:playCards': (cardIds: string[]) => void;
  'game:drawCard': () => void;
  'game:drawFromBottom': () => void;
  'game:nope': (cardId: string) => void;
  'game:passNope': () => void;
  
  // Action responses
  'action:selectPlayer': (playerId: string) => void;
  'action:selectCardName': (cardType: CardType) => void;
  'action:selectCardFromHand': (cardId: string) => void;
  'action:selectCardFromDiscard': (cardId: string) => void;
  'action:placeExplodingKitten': (position: number) => void;
  'action:reorderCards': (cardIds: string[]) => void;
  'action:giveCard': (cardId: string) => void;
  'action:dismissViewCards': () => void; // Confirm viewing cards (See the Future)
}

// ==================== Server -> Client Events ====================

export interface ServerToClientEvents {
  // Connection events
  'connected': (data: { playerId: string }) => void;
  'error': (message: string) => void;
  
  // Room events
  'room:created': (data: { roomCode: string; room: RoomData }) => void;
  'room:joined': (room: RoomData) => void;
  'room:updated': (room: RoomData) => void;
  'room:playerJoined': (player: RoomPlayer) => void;
  'room:playerLeft': (playerId: string) => void;
  'room:kicked': () => void;
  
  // Game events
  'game:started': (gameState: ClientGameState) => void;
  'game:stateUpdate': (gameState: ClientGameState) => void;
  'game:cardPlayed': (data: {
    playerId: string;
    playerName: string;
    cardTypes: CardType[];
    comboType?: ComboType;
  }) => void;
  'game:cardDrawn': (data: {
    playerId: string;
    playerName: string;
    cardCount: number;
  }) => void;
  'game:exploded': (data: {
    playerId: string;
    playerName: string;
  }) => void;
  'game:defused': (data: {
    playerId: string;
    playerName: string;
  }) => void;
  'game:nopeWindow': (data: {
    endTime: number;
    action: string;
  }) => void;
  'game:noped': (data: {
    noperId: string;
    noperName: string;
  }) => void;
  'game:yourTurn': () => void;
  'game:over': (data: {
    winnerId: string;
    winnerName: string;
  }) => void;
  
  // Action prompts
  'action:required': (data: {
    type: PendingActionType;
    message: string;
    options?: any;
  }) => void;
  'action:showCards': (data: {
    cards: Card[];
    canReorder: boolean;
  }) => void;
}

// Room data sent to client
export interface RoomData {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  maxPlayers: number;
  isGameStarted: boolean;
  settings: RoomSettings;
}
