import { v4 as uuidv4 } from 'uuid';
import { Deck } from './Deck';
import {
  Card,
  CardType,
  CardCategory,
  CARD_DEFINITIONS,
  isCatCard,
  CAT_CARD_TYPES,
  ComboType,
} from '../types/cards';
import {
  GameState,
  GamePhase,
  GameDirection,
  Player,
  PendingAction,
  PendingActionType,
  GameLog,
  ClientGameState,
  ClientPlayer,
  RoomSettings,
  RoomPlayer,
} from '../types/game';

export class GameEngine {
  private state: GameState;
  private nopeWindowTimer: NodeJS.Timeout | null = null;

  constructor(roomId: string, players: RoomPlayer[], settings: RoomSettings) {
    this.state = this.initializeGame(roomId, players, settings);
  }

  private initializeGame(roomId: string, roomPlayers: RoomPlayer[], settings: RoomSettings): GameState {
    const playerCount = roomPlayers.length;
    
    // Create deck
    const deck = Deck.createDeck(playerCount, settings);
    
    // Create Defuse cards - each player gets 1, rest go in deck
    const defuseCards = Deck.createDefuseCards(6);
    const playerDefuseCards = defuseCards.slice(0, playerCount);
    const deckDefuseCards = defuseCards.slice(playerCount);
    
    // Add remaining defuses to deck
    deckDefuseCards.forEach(card => deck.addCard(card));
    
    // Shuffle deck before dealing
    deck.shuffle();
    
    // Deal 7 cards to each player + 1 Defuse
    const players: Player[] = roomPlayers.map((rp, index) => {
      const hand: Card[] = [playerDefuseCards[index]];
      for (let i = 0; i < 7; i++) {
        const card = deck.drawTop();
        if (card) hand.push(card);
      }
      
      return {
        id: rp.id,
        name: rp.name,
        socketId: rp.socketId,
        hand,
        isAlive: true,
        isHost: rp.isHost,
        turnsToTake: 1,
        hasStreakingKitten: false,
        heldExplodingKitten: null,
      };
    });
    
    // Create Exploding Kittens (player count - 1)
    const explodingKittens = Deck.createExplodingKittens(playerCount - 1);
    explodingKittens.forEach(card => deck.addCard(card));
    
    // Add Imploding Kitten if enabled
    if (settings.expansions.implodingKittens) {
      deck.addCard(Deck.createImplodingKitten());
    }
    
    // Final shuffle
    deck.shuffle();
    
    return {
      id: roomId,
      phase: GamePhase.PLAYING,
      players,
      currentPlayerIndex: 0,
      direction: GameDirection.CLOCKWISE,
      deck: deck.getAllCards(),
      discardPile: [],
      lastPlayedCards: [],
      pendingAction: null,
      nopeWindowEndTime: null,
      winner: null,
      expansions: settings.expansions,
      turnCount: 1,
      logs: [{
        timestamp: Date.now(),
        action: 'Game started!',
      }],
    };
  }

  // Get the current game state
  getState(): GameState {
    return this.state;
  }

  // Get client view of game state (hides other players' cards)
  getClientState(playerId: string): ClientGameState {
    const myIndex = this.state.players.findIndex(p => p.id === playerId);
    const myPlayer = this.state.players[myIndex];
    
    const clientPlayers: ClientPlayer[] = this.state.players.map((p, index) => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length,
      isAlive: p.isAlive,
      isHost: p.isHost,
      turnsToTake: p.turnsToTake,
      isCurrentPlayer: index === this.state.currentPlayerIndex,
    }));

    return {
      phase: this.state.phase,
      players: clientPlayers,
      currentPlayerIndex: this.state.currentPlayerIndex,
      direction: this.state.direction,
      deckCount: this.state.deck.length,
      discardPile: this.state.discardPile,
      lastPlayedCards: this.state.lastPlayedCards,
      myHand: myPlayer ? myPlayer.hand : [],
      myIndex,
      myId: playerId,
      pendingAction: this.state.pendingAction,
      nopeWindowEndTime: this.state.nopeWindowEndTime,
      winner: this.state.winner ? clientPlayers.find(p => p.id === this.state.winner!.id)! : null,
      turnCount: this.state.turnCount,
      logs: this.state.logs.slice(-20), // Last 20 logs
    };
  }

  // Get current player
  getCurrentPlayer(): Player {
    return this.state.players[this.state.currentPlayerIndex];
  }

  // Check if it's the player's turn
  isPlayersTurn(playerId: string): boolean {
    return this.getCurrentPlayer().id === playerId;
  }

  // Add a log entry
  private addLog(action: string, playerId?: string, targetPlayerId?: string, cardTypes?: CardType[]): void {
    const player = playerId ? this.state.players.find(p => p.id === playerId) : undefined;
    const target = targetPlayerId ? this.state.players.find(p => p.id === targetPlayerId) : undefined;
    
    this.state.logs.push({
      timestamp: Date.now(),
      playerId,
      playerName: player?.name,
      action,
      cardTypes,
      targetPlayerId,
      targetPlayerName: target?.name,
    });
  }

  // Play cards
  playCards(playerId: string, cardIds: string[]): { success: boolean; error?: string; comboType?: ComboType; needsTarget?: boolean } {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };
    if (!player.isAlive) return { success: false, error: 'Player is dead' };
    
    // Check if it's this player's turn (unless playing Nope)
    const cards = cardIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean) as Card[];
    if (cards.length !== cardIds.length) {
      return { success: false, error: 'Some cards not found in hand' };
    }

    // Check for combos
    const comboResult = this.checkCombo(cards);
    if (comboResult) {
      return this.playCombo(player, cards, comboResult);
    }

    // Single card play
    if (cards.length !== 1) {
      return { success: false, error: 'Must play exactly one card or a valid combo' };
    }

    const card = cards[0];
    
    // Check turn (Nope can be played anytime during nope window)
    if (card.type !== CardType.NOPE && !this.isPlayersTurn(playerId)) {
      return { success: false, error: 'Not your turn' };
    }

    return this.playSingleCard(player, card);
  }

  // Check if cards form a valid combo
  private checkCombo(cards: Card[]): ComboType | null {
    if (cards.length === 2) {
      // Two of a kind - both must be cat cards (or feral)
      if (this.areSameCatCards(cards)) {
        return ComboType.TWO_OF_A_KIND;
      }
    } else if (cards.length === 3) {
      // Three of a kind
      if (this.areSameCatCards(cards)) {
        return ComboType.THREE_OF_A_KIND;
      }
    } else if (cards.length === 5) {
      // Five different cards
      if (this.areFiveDifferent(cards)) {
        return ComboType.FIVE_DIFFERENT;
      }
    }
    return null;
  }

  // Check if cards are the same type of cat cards (Feral counts as any)
  private areSameCatCards(cards: Card[]): boolean {
    const catCards = cards.filter(c => isCatCard(c.type));
    if (catCards.length !== cards.length) return false;
    
    const nonFeralTypes = catCards
      .filter(c => c.type !== CardType.FERAL_CAT)
      .map(c => c.type);
    
    if (nonFeralTypes.length === 0) return true; // All feral
    
    const firstType = nonFeralTypes[0];
    return nonFeralTypes.every(t => t === firstType);
  }

  // Check if cards are five different types
  private areFiveDifferent(cards: Card[]): boolean {
    const types = new Set(cards.map(c => c.type));
    return types.size === 5;
  }

  // Play a combo
  private playCombo(player: Player, cards: Card[], comboType: ComboType): { success: boolean; error?: string; comboType?: ComboType; needsTarget?: boolean } {
    // Remove cards from hand
    cards.forEach(card => {
      const index = player.hand.findIndex(c => c.id === card.id);
      if (index !== -1) player.hand.splice(index, 1);
    });

    // Add to discard
    this.state.discardPile.push(...cards);
    this.state.lastPlayedCards = cards;

    const cardTypes = cards.map(c => c.type);
    
    if (comboType === ComboType.TWO_OF_A_KIND) {
      this.addLog('played Two of a Kind', player.id, undefined, cardTypes);
      this.state.pendingAction = {
        type: PendingActionType.SELECT_PLAYER,
        playerId: player.id,
      };
      this.state.phase = GamePhase.AWAITING_ACTION;
      return { success: true, comboType, needsTarget: true };
    }
    
    if (comboType === ComboType.THREE_OF_A_KIND) {
      this.addLog('played Three of a Kind', player.id, undefined, cardTypes);
      this.state.pendingAction = {
        type: PendingActionType.SELECT_PLAYER,
        playerId: player.id,
      };
      this.state.phase = GamePhase.AWAITING_ACTION;
      return { success: true, comboType, needsTarget: true };
    }
    
    if (comboType === ComboType.FIVE_DIFFERENT) {
      this.addLog('played Five Different Cards', player.id, undefined, cardTypes);
      if (this.state.discardPile.length > 0) {
        this.state.pendingAction = {
          type: PendingActionType.SELECT_CARD_FROM_DISCARD,
          playerId: player.id,
          cards: this.state.discardPile.filter(c => !cards.includes(c)),
        };
        this.state.phase = GamePhase.AWAITING_ACTION;
      }
      return { success: true, comboType, needsTarget: true };
    }

    return { success: false, error: 'Invalid combo' };
  }

  // Play a single card
  private playSingleCard(player: Player, card: Card): { success: boolean; error?: string; needsTarget?: boolean } {
    const def = CARD_DEFINITIONS[card.type];
    
    // Cat cards can't be played alone
    if (def.category === CardCategory.CAT) {
      return { success: false, error: 'Cat cards must be played in combos' };
    }

    // Remove card from hand
    const cardIndex = player.hand.findIndex(c => c.id === card.id);
    player.hand.splice(cardIndex, 1);
    
    // Add to discard
    this.state.discardPile.push(card);
    this.state.lastPlayedCards = [card];

    // Process card effect
    return this.processCardEffect(player, card);
  }

  // Process card effect
  private processCardEffect(player: Player, card: Card): { success: boolean; needsTarget?: boolean } {
    switch (card.type) {
      case CardType.ATTACK:
        this.addLog('played Attack', player.id, undefined, [card.type]);
        this.endTurnWithAttack(player, 2);
        return { success: true };

      case CardType.TARGETED_ATTACK:
        this.addLog('played Targeted Attack', player.id, undefined, [card.type]);
        this.state.pendingAction = {
          type: PendingActionType.SELECT_PLAYER,
          playerId: player.id,
        };
        this.state.phase = GamePhase.AWAITING_ACTION;
        return { success: true, needsTarget: true };

      case CardType.SKIP:
        this.addLog('played Skip', player.id, undefined, [card.type]);
        this.endTurn();
        return { success: true };

      case CardType.SUPER_SKIP:
        this.addLog('played Super Skip', player.id, undefined, [card.type]);
        player.turnsToTake = 0;
        this.endTurn();
        return { success: true };

      case CardType.FAVOR:
        this.addLog('played Favor', player.id, undefined, [card.type]);
        this.state.pendingAction = {
          type: PendingActionType.SELECT_PLAYER,
          playerId: player.id,
        };
        this.state.phase = GamePhase.AWAITING_ACTION;
        return { success: true, needsTarget: true };

      case CardType.SHUFFLE:
        this.addLog('played Shuffle', player.id, undefined, [card.type]);
        this.shuffleDeck();
        return { success: true };

      case CardType.SEE_THE_FUTURE_3:
        this.addLog('played See the Future', player.id, undefined, [card.type]);
        // See the Future: only view, don't reorder
        this.state.pendingAction = {
          type: PendingActionType.VIEW_CARDS,
          playerId: player.id,
          cards: this.peekDeck(3),
          count: 3,
        };
        this.state.phase = GamePhase.AWAITING_ACTION;
        return { success: true };

      case CardType.SEE_THE_FUTURE_5:
        this.addLog('played See the Future (5x)', player.id, undefined, [card.type]);
        // See the Future: only view, don't reorder
        this.state.pendingAction = {
          type: PendingActionType.VIEW_CARDS,
          playerId: player.id,
          cards: this.peekDeck(5),
          count: 5,
        };
        this.state.phase = GamePhase.AWAITING_ACTION;
        return { success: true };

      case CardType.ALTER_THE_FUTURE_3:
        this.addLog('played Alter the Future', player.id, undefined, [card.type]);
        this.state.pendingAction = {
          type: PendingActionType.REORDER_CARDS,
          playerId: player.id,
          cards: this.peekDeck(3),
          count: 3,
        };
        this.state.phase = GamePhase.AWAITING_ACTION;
        return { success: true };

      case CardType.ALTER_THE_FUTURE_5:
        this.addLog('played Alter the Future (5x)', player.id, undefined, [card.type]);
        this.state.pendingAction = {
          type: PendingActionType.REORDER_CARDS,
          playerId: player.id,
          cards: this.peekDeck(5),
          count: 5,
        };
        this.state.phase = GamePhase.AWAITING_ACTION;
        return { success: true };

      case CardType.REVERSE:
        this.addLog('played Reverse', player.id, undefined, [card.type]);
        this.state.direction = this.state.direction === GameDirection.CLOCKWISE 
          ? GameDirection.COUNTER_CLOCKWISE 
          : GameDirection.CLOCKWISE;
        this.endTurn();
        return { success: true };

      case CardType.DRAW_FROM_BOTTOM:
        this.addLog('played Draw From Bottom', player.id, undefined, [card.type]);
        this.drawCardFromBottom(player);
        return { success: true };

      case CardType.SWAP_TOP_AND_BOTTOM:
        this.addLog('played Swap Top and Bottom', player.id, undefined, [card.type]);
        this.swapTopAndBottom();
        return { success: true };

      case CardType.GARBAGE_COLLECTION:
        this.addLog('played Garbage Collection', player.id, undefined, [card.type]);
        this.startGarbageCollection(player.id);
        return { success: true };

      case CardType.CATOMIC_BOMB:
        this.addLog('played Catomic Bomb!', player.id, undefined, [card.type]);
        this.executeCatomicBomb();
        return { success: true };

      default:
        return { success: false };
    }
  }

  // Draw a card
  drawCard(playerId: string): { success: boolean; error?: string; card?: Card; exploded?: boolean } {
    if (!this.isPlayersTurn(playerId)) {
      return { success: false, error: 'Not your turn' };
    }

    const player = this.getCurrentPlayer();
    if (!player.isAlive) {
      return { success: false, error: 'Player is dead' };
    }

    if (this.state.deck.length === 0) {
      return { success: false, error: 'Deck is empty' };
    }

    const card = this.state.deck.shift()!;
    
    return this.handleDrawnCard(player, card);
  }

  // Draw from bottom
  drawCardFromBottom(player: Player): { success: boolean; card?: Card; exploded?: boolean } {
    if (this.state.deck.length === 0) {
      return { success: false };
    }

    const card = this.state.deck.pop()!;
    return this.handleDrawnCard(player, card);
  }

  // Handle drawn card (check for explosion)
  private handleDrawnCard(player: Player, card: Card): { success: boolean; card?: Card; exploded?: boolean } {
    if (card.type === CardType.EXPLODING_KITTEN) {
      return this.handleExplodingKitten(player, card);
    }

    if (card.type === CardType.IMPLODING_KITTEN) {
      return this.handleImplodingKitten(player, card);
    }

    // Normal card - add to hand
    player.hand.push(card);
    this.addLog('drew a card', player.id);
    this.endTurn();
    
    return { success: true, card };
  }

  // Handle exploding kitten
  private handleExplodingKitten(player: Player, card: Card): { success: boolean; exploded?: boolean } {
    // Check for Streaking Kitten
    if (player.hasStreakingKitten && !player.heldExplodingKitten) {
      player.heldExplodingKitten = card;
      this.addLog('secretly held an Exploding Kitten!', player.id);
      this.endTurn();
      return { success: true, exploded: false };
    }

    // Check for Defuse
    const defuseIndex = player.hand.findIndex(c => c.type === CardType.DEFUSE);
    if (defuseIndex !== -1) {
      this.addLog('drew an Exploding Kitten!', player.id);
      this.state.phase = GamePhase.DEFUSING;
      this.state.pendingAction = {
        type: PendingActionType.PLACE_EXPLODING_KITTEN,
        playerId: player.id,
        cards: [card],
      };
      // Auto-use Defuse
      const defuse = player.hand.splice(defuseIndex, 1)[0];
      this.state.discardPile.push(defuse);
      this.addLog('used Defuse!', player.id, undefined, [CardType.DEFUSE]);
      return { success: true, exploded: false };
    }

    // Player explodes
    this.explodePlayer(player);
    return { success: true, exploded: true };
  }

  // Handle imploding kitten
  private handleImplodingKitten(player: Player, card: Card): { success: boolean; exploded?: boolean } {
    if (!card.faceUp) {
      // First time: flip face up and put back on top
      card.faceUp = true;
      this.state.deck.unshift(card);
      this.addLog('drew the Imploding Kitten and put it back face up!', player.id);
      this.endTurn();
      return { success: true, exploded: false };
    } else {
      // Face up: player implodes (cannot be defused)
      this.addLog('drew the Imploding Kitten face up and IMPLODED!', player.id);
      this.explodePlayer(player);
      return { success: true, exploded: true };
    }
  }

  // Place exploding kitten back in deck
  placeExplodingKitten(playerId: string, position: number): { success: boolean; error?: string } {
    if (this.state.phase !== GamePhase.DEFUSING) {
      return { success: false, error: 'Not defusing' };
    }

    if (!this.state.pendingAction || this.state.pendingAction.playerId !== playerId) {
      return { success: false, error: 'Not your turn to place' };
    }

    const card = this.state.pendingAction.cards![0];
    const pos = Math.max(0, Math.min(position, this.state.deck.length));
    this.state.deck.splice(pos, 0, card);

    this.addLog('placed the Exploding Kitten back in the deck', playerId);
    this.state.pendingAction = null;
    this.state.phase = GamePhase.PLAYING;
    this.endTurn();

    return { success: true };
  }

  // Explode a player
  private explodePlayer(player: Player): void {
    player.isAlive = false;
    this.addLog('EXPLODED!', player.id);

    // Check if Streaking Kitten explodes too
    if (player.heldExplodingKitten) {
      this.state.discardPile.push(player.heldExplodingKitten);
      player.heldExplodingKitten = null;
    }

    // Discard all cards
    this.state.discardPile.push(...player.hand);
    player.hand = [];

    // Check for winner
    const alivePlayers = this.state.players.filter(p => p.isAlive);
    if (alivePlayers.length === 1) {
      this.state.winner = alivePlayers[0];
      this.state.phase = GamePhase.GAME_OVER;
      this.addLog(`${alivePlayers[0].name} WINS!`);
    } else {
      this.endTurn();
    }
  }

  // Handle player quitting the game
  playerQuit(playerId: string): boolean {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || !player.isAlive) return false;

    const wasCurrentPlayer = this.getCurrentPlayer().id === playerId;
    
    // Mark player as dead
    player.isAlive = false;
    this.addLog('quit the game', playerId);

    // Discard all cards
    this.state.discardPile.push(...player.hand);
    player.hand = [];

    // Handle held exploding kitten
    if (player.heldExplodingKitten) {
      this.state.discardPile.push(player.heldExplodingKitten);
      player.heldExplodingKitten = null;
    }

    // Clear any pending action if it was this player's
    if (this.state.pendingAction?.playerId === playerId) {
      this.state.pendingAction = null;
      this.state.phase = GamePhase.PLAYING;
    }

    // Check for winner
    const alivePlayers = this.state.players.filter(p => p.isAlive);
    if (alivePlayers.length === 1) {
      this.state.winner = alivePlayers[0];
      this.state.phase = GamePhase.GAME_OVER;
      this.addLog(`${alivePlayers[0].name} WINS!`);
    } else if (wasCurrentPlayer) {
      // Move to next player if the quitter was the current player
      this.moveToNextPlayer();
    }

    return true;
  }

  // End turn
  private endTurn(): void {
    const currentPlayer = this.getCurrentPlayer();
    currentPlayer.turnsToTake--;

    if (currentPlayer.turnsToTake > 0) {
      // Still has turns to take
      return;
    }

    // Move to next player
    this.moveToNextPlayer();
  }

  // End turn with attack (pass turns to next player without decrementing current)
  private endTurnWithAttack(attacker: Player, extraTurns: number): void {
    // Current player doesn't need to draw, just move to next
    const playerCount = this.state.players.length;
    let nextIndex = this.state.currentPlayerIndex;
    
    do {
      nextIndex = (nextIndex + this.state.direction + playerCount) % playerCount;
    } while (!this.state.players[nextIndex].isAlive && nextIndex !== this.state.currentPlayerIndex);

    this.state.currentPlayerIndex = nextIndex;
    // Add extra turns to the next player's existing turns
    this.state.players[nextIndex].turnsToTake += extraTurns;
    this.state.turnCount++;
    this.addLog(`${this.state.players[nextIndex].name} must take ${this.state.players[nextIndex].turnsToTake} turns!`);
  }

  // Move to next alive player
  private moveToNextPlayer(): void {
    const playerCount = this.state.players.length;
    let nextIndex = this.state.currentPlayerIndex;
    
    do {
      nextIndex = (nextIndex + this.state.direction + playerCount) % playerCount;
    } while (!this.state.players[nextIndex].isAlive && nextIndex !== this.state.currentPlayerIndex);

    this.state.currentPlayerIndex = nextIndex;
    // Only set to 1 if player has no pending turns
    if (this.state.players[nextIndex].turnsToTake <= 0) {
      this.state.players[nextIndex].turnsToTake = 1;
    }
    this.state.turnCount++;
  }

  // Shuffle deck
  private shuffleDeck(): void {
    for (let i = this.state.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.state.deck[i], this.state.deck[j]] = [this.state.deck[j], this.state.deck[i]];
    }
  }

  // Peek top cards of deck
  private peekDeck(count: number): Card[] {
    return this.state.deck.slice(0, count);
  }

  // Swap top and bottom
  private swapTopAndBottom(): void {
    if (this.state.deck.length >= 2) {
      const temp = this.state.deck[0];
      this.state.deck[0] = this.state.deck[this.state.deck.length - 1];
      this.state.deck[this.state.deck.length - 1] = temp;
    }
  }

  // Execute garbage collection - shuffle discard pile back into deck
  private startGarbageCollection(initiatorId: string): void {
    // Take all cards from discard pile (except Garbage Collection itself which is already there)
    const garbageCards = this.state.discardPile.slice();
    
    if (garbageCards.length === 0) {
      this.addLog('no cards to recycle', initiatorId);
      return;
    }
    
    // Clear discard pile
    this.state.discardPile = [];
    
    // Shuffle garbage cards and put them at the bottom of the deck
    for (let i = garbageCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [garbageCards[i], garbageCards[j]] = [garbageCards[j], garbageCards[i]];
    }
    
    // Add to bottom of deck
    this.state.deck.push(...garbageCards);
    
    this.addLog(`recycled ${garbageCards.length} cards into the deck`, initiatorId);
  }

  // Execute catomic bomb
  private executeCatomicBomb(): void {
    // Collect all exploding kittens from discard pile
    const explodingKittens: Card[] = [];
    this.state.discardPile = this.state.discardPile.filter(card => {
      if (card.type === CardType.EXPLODING_KITTEN) {
        explodingKittens.push(card);
        return false;
      }
      return true;
    });

    // All players discard hand except Defuse
    for (const player of this.state.players) {
      if (!player.isAlive) continue;
      
      const defuses = player.hand.filter(c => c.type === CardType.DEFUSE);
      const others = player.hand.filter(c => c.type !== CardType.DEFUSE);
      
      this.state.discardPile.push(...others);
      player.hand = defuses;

      // Handle held exploding kitten
      if (player.heldExplodingKitten) {
        explodingKittens.push(player.heldExplodingKitten);
        player.heldExplodingKitten = null;
        player.hasStreakingKitten = false;
      }
    }

    // Put exploding kittens on top of deck
    this.state.deck = [...explodingKittens, ...this.state.deck];

    // Shuffle the exploding kittens portion
    const kittenCount = explodingKittens.length;
    for (let i = kittenCount - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.state.deck[i], this.state.deck[j]] = [this.state.deck[j], this.state.deck[i]];
    }
  }

  // Handle action: select player
  selectPlayer(playerId: string, targetId: string): { success: boolean; error?: string } {
    if (!this.state.pendingAction || this.state.pendingAction.playerId !== playerId) {
      return { success: false, error: 'No pending action' };
    }

    const target = this.state.players.find(p => p.id === targetId);
    if (!target || !target.isAlive || target.id === playerId) {
      return { success: false, error: 'Invalid target' };
    }

    const actionType = this.state.pendingAction.type;
    
    if (actionType === PendingActionType.SELECT_PLAYER) {
      // Check what kind of action needs target
      const lastCardType = this.state.lastPlayedCards[0]?.type;
      
      if (lastCardType === CardType.TARGETED_ATTACK) {
        target.turnsToTake += 2;
        this.state.currentPlayerIndex = this.state.players.indexOf(target);
        this.addLog(`targeted ${target.name} with attack!`, playerId, targetId);
        this.state.pendingAction = null;
        this.state.phase = GamePhase.PLAYING;
        return { success: true };
      }
      
      if (lastCardType === CardType.FAVOR) {
        this.state.pendingAction = {
          type: PendingActionType.SELECT_CARD_TO_GIVE,
          playerId: targetId,
          targetPlayerId: playerId,
        };
        this.addLog(`asked ${target.name} for a favor`, playerId, targetId);
        return { success: true };
      }

      // Two of a kind - random steal
      if (this.state.lastPlayedCards.length === 2) {
        if (target.hand.length === 0) {
          this.state.pendingAction = null;
          this.state.phase = GamePhase.PLAYING;
          this.addLog(`tried to steal from ${target.name} but they have no cards`, playerId, targetId);
          return { success: true };
        }
        const randomIndex = Math.floor(Math.random() * target.hand.length);
        const stolenCard = target.hand.splice(randomIndex, 1)[0];
        const player = this.state.players.find(p => p.id === playerId)!;
        player.hand.push(stolenCard);
        this.addLog(`stole a card from ${target.name}`, playerId, targetId);
        this.state.pendingAction = null;
        this.state.phase = GamePhase.PLAYING;
        return { success: true };
      }

      // Three of a kind - ask for specific card
      if (this.state.lastPlayedCards.length === 3) {
        this.state.pendingAction = {
          type: PendingActionType.SELECT_CARD_NAME,
          playerId: playerId,
          targetPlayerId: targetId,
        };
        return { success: true };
      }
    }

    return { success: false, error: 'Unknown action' };
  }

  // Handle action: select card name (for Three of a Kind)
  selectCardName(playerId: string, cardType: CardType): { success: boolean; error?: string } {
    if (!this.state.pendingAction || 
        this.state.pendingAction.type !== PendingActionType.SELECT_CARD_NAME ||
        this.state.pendingAction.playerId !== playerId) {
      return { success: false, error: 'No pending action' };
    }

    const target = this.state.players.find(p => p.id === this.state.pendingAction!.targetPlayerId);
    if (!target) return { success: false, error: 'Target not found' };

    const cardIndex = target.hand.findIndex(c => c.type === cardType);
    const player = this.state.players.find(p => p.id === playerId)!;

    if (cardIndex !== -1) {
      const card = target.hand.splice(cardIndex, 1)[0];
      player.hand.push(card);
      this.addLog(`stole ${CARD_DEFINITIONS[cardType].nameZh} from ${target.name}!`, playerId, target.id, [cardType]);
    } else {
      this.addLog(`asked for ${CARD_DEFINITIONS[cardType].nameZh} but ${target.name} doesn't have it`, playerId, target.id);
    }

    this.state.pendingAction = null;
    this.state.phase = GamePhase.PLAYING;
    return { success: true };
  }

  // Handle action: give card (for Favor)
  giveCard(playerId: string, cardId: string): { success: boolean; error?: string } {
    if (!this.state.pendingAction || 
        this.state.pendingAction.type !== PendingActionType.SELECT_CARD_TO_GIVE ||
        this.state.pendingAction.playerId !== playerId) {
      return { success: false, error: 'No pending action' };
    }

    const giver = this.state.players.find(p => p.id === playerId);
    const receiver = this.state.players.find(p => p.id === this.state.pendingAction!.targetPlayerId);
    
    if (!giver || !receiver) return { success: false, error: 'Player not found' };

    const cardIndex = giver.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { success: false, error: 'Card not found' };

    const card = giver.hand.splice(cardIndex, 1)[0];
    receiver.hand.push(card);

    this.addLog(`gave a card to ${receiver.name}`, playerId, receiver.id);
    this.state.pendingAction = null;
    this.state.phase = GamePhase.PLAYING;
    return { success: true };
  }

  // Handle action: select card from discard (for Five Different)
  selectCardFromDiscard(playerId: string, cardId: string): { success: boolean; error?: string } {
    if (!this.state.pendingAction || 
        this.state.pendingAction.type !== PendingActionType.SELECT_CARD_FROM_DISCARD ||
        this.state.pendingAction.playerId !== playerId) {
      return { success: false, error: 'No pending action' };
    }

    const cardIndex = this.state.discardPile.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { success: false, error: 'Card not found in discard' };

    const player = this.state.players.find(p => p.id === playerId)!;
    const card = this.state.discardPile.splice(cardIndex, 1)[0];
    player.hand.push(card);

    this.addLog(`took ${CARD_DEFINITIONS[card.type].nameZh} from discard pile`, playerId, undefined, [card.type]);
    this.state.pendingAction = null;
    this.state.phase = GamePhase.PLAYING;
    return { success: true };
  }

  // Handle action: reorder cards (for See/Alter the Future)
  reorderCards(playerId: string, cardIds: string[]): { success: boolean; error?: string } {
    if (!this.state.pendingAction || 
        this.state.pendingAction.type !== PendingActionType.REORDER_CARDS ||
        this.state.pendingAction.playerId !== playerId) {
      return { success: false, error: 'No pending action' };
    }

    const count = this.state.pendingAction.count!;
    if (cardIds.length !== count) {
      return { success: false, error: 'Wrong number of cards' };
    }

    // Verify all card IDs match
    const topCardIds = new Set(this.state.deck.slice(0, count).map(c => c.id));
    if (!cardIds.every(id => topCardIds.has(id))) {
      return { success: false, error: 'Invalid card IDs' };
    }

    // Reorder
    const topCards = this.state.deck.slice(0, count);
    const reordered = cardIds.map(id => topCards.find(c => c.id === id)!);
    for (let i = 0; i < count; i++) {
      this.state.deck[i] = reordered[i];
    }

    const isAlter = this.state.lastPlayedCards[0]?.type.includes('alter');
    this.addLog(isAlter ? 'altered the future' : 'saw the future', playerId);
    this.state.pendingAction = null;
    this.state.phase = GamePhase.PLAYING;
    return { success: true };
  }

  // Handle action: dismiss view cards (for See the Future - no reorder)
  dismissViewCards(playerId: string): { success: boolean; error?: string } {
    if (!this.state.pendingAction || 
        this.state.pendingAction.type !== PendingActionType.VIEW_CARDS ||
        this.state.pendingAction.playerId !== playerId) {
      return { success: false, error: 'No pending action' };
    }

    this.addLog('saw the future', playerId);
    this.state.pendingAction = null;
    this.state.phase = GamePhase.PLAYING;
    return { success: true };
  }

  // Handle garbage collection response
  submitGarbageCard(playerId: string, cardId: string): { success: boolean; error?: string; complete?: boolean } {
    if (!this.state.pendingAction || 
        this.state.pendingAction.type !== PendingActionType.SELECT_CARD_FOR_GARBAGE) {
      return { success: false, error: 'No garbage collection pending' };
    }

    const waitingPlayers = this.state.pendingAction.waitingForPlayers!;
    if (!waitingPlayers.includes(playerId)) {
      return { success: false, error: 'Not waiting for your card' };
    }

    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { success: false, error: 'Card not found' };

    // Remove card from hand and add to deck
    const card = player.hand.splice(cardIndex, 1)[0];
    this.state.deck.push(card);

    // Remove player from waiting list
    const playerIndex = waitingPlayers.indexOf(playerId);
    waitingPlayers.splice(playerIndex, 1);

    if (waitingPlayers.length === 0) {
      // All players submitted, shuffle deck
      this.shuffleDeck();
      this.addLog('Garbage collection complete, deck shuffled');
      this.state.pendingAction = null;
      this.state.phase = GamePhase.PLAYING;
      return { success: true, complete: true };
    }

    return { success: true, complete: false };
  }

  // Check Streaking Kitten status
  updateStreakingKittenStatus(): void {
    for (const player of this.state.players) {
      const hasStreaking = player.hand.some(c => c.type === CardType.STREAKING_KITTEN);
      
      if (player.hasStreakingKitten && !hasStreaking && player.heldExplodingKitten) {
        // Lost Streaking Kitten, explode!
        this.addLog('lost Streaking Kitten and EXPLODED!', player.id);
        this.explodePlayer(player);
      }
      
      player.hasStreakingKitten = hasStreaking;
    }
  }
}
