import { Card, CardType } from './cards';

// Player state
export interface Player {
  id: string;
  name: string;
  socketId: string;
  hand: Card[];
  isAlive: boolean;
  isHost: boolean;
  turnsToTake: number; // For attack stacking
  hasStreakingKitten: boolean;
  heldExplodingKitten: Card | null; // When protected by Streaking Kitten
}

// Game direction
export enum GameDirection {
  CLOCKWISE = 1,
  COUNTER_CLOCKWISE = -1,
}

// Game phase
export enum GamePhase {
  WAITING = 'waiting',
  PLAYING = 'playing',
  NOPE_WINDOW = 'nope_window',
  AWAITING_ACTION = 'awaiting_action', // Waiting for player to choose target, card, etc.
  DEFUSING = 'defusing',
  GAME_OVER = 'game_over',
}

// Action that requires player input
export enum PendingActionType {
  NONE = 'none',
  SELECT_PLAYER = 'select_player',
  SELECT_CARD_FROM_PLAYER = 'select_card_from_player',
  SELECT_CARD_NAME = 'select_card_name',
  SELECT_CARD_FROM_DISCARD = 'select_card_from_discard',
  PLACE_EXPLODING_KITTEN = 'place_exploding_kitten',
  REORDER_CARDS = 'reorder_cards',
  VIEW_CARDS = 'view_cards', // See the Future - just view, no reorder
  SELECT_CARD_TO_GIVE = 'select_card_to_give',
  SELECT_CARD_FOR_GARBAGE = 'select_card_for_garbage',
  NOPE_WINDOW = 'nope_window', // Asking player if they want to play Nope
}

// Pending action details
export interface PendingAction {
  type: PendingActionType;
  playerId: string; // Who needs to respond
  targetPlayerId?: string;
  cards?: Card[];
  count?: number;
  cardType?: CardType;
  waitingForPlayers?: string[]; // For garbage collection
  // For Nope window
  originalAction?: {
    type: PendingActionType;
    playerId: string; // Who played the card
    cardTypes: CardType[]; // What cards were played
  };
  nopeChainCount?: number; // How many Nopes have been chained
}

// Game state
export interface GameState {
  id: string;
  phase: GamePhase;
  players: Player[];
  currentPlayerIndex: number;
  direction: GameDirection;
  deck: Card[];
  discardPile: Card[];
  lastPlayedCards: Card[];
  pendingAction: PendingAction | null;
  nopeWindowEndTime: number | null;
  winner: Player | null;
  expansions: {
    implodingKittens: boolean;
    streakingKittens: boolean;
  };
  turnCount: number;
  logs: GameLog[];
}

// Game log entry
export interface GameLog {
  timestamp: number;
  playerId?: string;
  playerName?: string;
  action: string;
  cardTypes?: CardType[];
  targetPlayerId?: string;
  targetPlayerName?: string;
}

// Room state
export interface Room {
  id: string;
  code: string;
  hostId: string;
  players: RoomPlayer[];
  maxPlayers: number;
  isGameStarted: boolean;
  gameState: GameState | null;
  settings: RoomSettings;
  createdAt: number;
}

// Room player (before game starts)
export interface RoomPlayer {
  id: string;
  name: string;
  socketId: string;
  isHost: boolean;
  isReady: boolean;
}

// Room settings
export interface RoomSettings {
  expansions: {
    implodingKittens: boolean;
    streakingKittens: boolean;
  };
  nopeWindowSeconds: number;
  turnTimeoutSeconds: number;
}

// Client game view (hides other players' cards)
export interface ClientGameState {
  phase: GamePhase;
  players: ClientPlayer[];
  currentPlayerIndex: number;
  direction: GameDirection;
  deckCount: number;
  discardPile: Card[];
  lastPlayedCards: Card[];
  myHand: Card[];
  myIndex: number;
  myId: string; // Current player's ID
  pendingAction: PendingAction | null;
  nopeWindowEndTime: number | null;
  winner: ClientPlayer | null;
  turnCount: number;
  logs: GameLog[];
  topCards?: Card[]; // Only visible when using See/Alter the Future
}

// Client player view
export interface ClientPlayer {
  id: string;
  name: string;
  cardCount: number;
  isAlive: boolean;
  isHost: boolean;
  turnsToTake: number;
  isCurrentPlayer: boolean;
}
