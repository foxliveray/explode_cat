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
      topDeckCard: this.state.deck.length > 0 && this.state.deck[0].faceUp ? this.state.deck[0] : undefined,
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

  // Update player's socket ID (for reconnection)
  updatePlayerSocketId(playerId: string, newSocketId: string): void {
    const player = this.state.players.find(p => p.id === playerId);
    if (player) {
      player.socketId = newSocketId;
    }
  }

  // 获取下一个有否决牌的玩家（按顺序）
  private getNextPlayerWithNope(startIndex: number, excludePlayerId: string): Player | null {
    const playerCount = this.state.players.length;
    for (let i = 1; i < playerCount; i++) {
      const index = (startIndex + i * this.state.direction + playerCount) % playerCount;
      const player = this.state.players[index];
      if (player.isAlive && player.id !== excludePlayerId) {
        const hasNope = player.hand.some(c => c.type === CardType.NOPE);
        if (hasNope) {
          return player;
        }
      }
    }
    return null;
  }

  // 获取所有有否决牌的其他玩家
  private getPlayersWithNope(excludePlayerId: string): string[] {
    return this.state.players
      .filter(p => p.isAlive && p.id !== excludePlayerId && p.hand.some(c => c.type === CardType.NOPE))
      .map(p => p.id);
  }

  // 启动否决窗口
  startNopeWindow(originalPlayerId: string, cardTypes: CardType[], originalActionType: PendingActionType): void {
    const playersWithNope = this.getPlayersWithNope(originalPlayerId);
    
    if (playersWithNope.length === 0) {
      // 没有人有否决牌，直接执行
      return;
    }

    // 找到第一个有否决牌的玩家（按顺序）
    const originalPlayerIndex = this.state.players.findIndex(p => p.id === originalPlayerId);
    const firstPlayer = this.getNextPlayerWithNope(originalPlayerIndex, originalPlayerId);
    
    if (!firstPlayer) {
      return;
    }

    this.state.phase = GamePhase.NOPE_WINDOW;
    this.state.pendingAction = {
      type: PendingActionType.NOPE_WINDOW,
      playerId: firstPlayer.id, // 当前询问的玩家
      waitingForPlayers: playersWithNope, // 还没回应的玩家
      originalAction: {
        type: originalActionType,
        playerId: originalPlayerId,
        cardTypes: cardTypes,
      },
      nopeChainCount: 0,
    };
  }

  // 玩家打出否决牌
  playNope(playerId: string, cardId: string): { success: boolean; error?: string } {
    if (this.state.phase !== GamePhase.NOPE_WINDOW || !this.state.pendingAction) {
      return { success: false, error: 'Not in nope window' };
    }

    if (this.state.pendingAction.playerId !== playerId) {
      return { success: false, error: 'Not your turn to respond' };
    }

    const player = this.state.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    const cardIndex = player.hand.findIndex(c => c.id === cardId && c.type === CardType.NOPE);
    if (cardIndex === -1) {
      return { success: false, error: 'Nope card not found' };
    }

    // 移除并弃掉否决牌
    const nopeCard = player.hand.splice(cardIndex, 1)[0];
    this.state.discardPile.push(nopeCard);

    const nopeCount = (this.state.pendingAction.nopeChainCount || 0) + 1;
    
    // 奇数次否决 = 取消动作，偶数次 = 恢复动作
    if (nopeCount % 2 === 1) {
      // 否决成功，取消原动作
      this.addLog('played Nope! Action cancelled.', playerId, undefined, [CardType.NOPE]);
      
      // 检查是否有人可以再否决这个否决
      const playersWithNope = this.getPlayersWithNope(playerId);
      if (playersWithNope.length > 0) {
        // 开启一个新的否决窗口，让其他人可以否决这个否决
        const playerIndex = this.state.players.findIndex(p => p.id === playerId);
        const nextPlayer = this.getNextPlayerWithNope(playerIndex, playerId);
        
        if (nextPlayer) {
          this.state.pendingAction = {
            type: PendingActionType.NOPE_WINDOW,
            playerId: nextPlayer.id,
            waitingForPlayers: playersWithNope,
            originalAction: this.state.pendingAction.originalAction,
            nopeChainCount: nopeCount,
          };
          return { success: true };
        }
      }
      
      // 没有人能否决这个否决，动作被取消
      this.state.pendingAction = null;
      this.state.phase = GamePhase.PLAYING;
    } else {
      // 偶数次否决 = 恢复原动作（否决了否决）
      this.addLog('played Nope! Action restored.', playerId, undefined, [CardType.NOPE]);
      
      // 继续检查是否有人可以再否决
      const playersWithNope = this.getPlayersWithNope(playerId);
      if (playersWithNope.length > 0) {
        const playerIndex = this.state.players.findIndex(p => p.id === playerId);
        const nextPlayer = this.getNextPlayerWithNope(playerIndex, playerId);
        
        if (nextPlayer) {
          this.state.pendingAction = {
            type: PendingActionType.NOPE_WINDOW,
            playerId: nextPlayer.id,
            waitingForPlayers: playersWithNope,
            originalAction: this.state.pendingAction.originalAction,
            nopeChainCount: nopeCount,
          };
          return { success: true };
        }
      }
      
      // 没有人能否决，恢复原动作执行
      this.executeOriginalAction();
    }
    
    return { success: true };
  }

  // 玩家跳过否决机会
  passNope(playerId: string): { success: boolean; error?: string } {
    if (this.state.phase !== GamePhase.NOPE_WINDOW || !this.state.pendingAction) {
      return { success: false, error: 'Not in nope window' };
    }

    if (this.state.pendingAction.playerId !== playerId) {
      return { success: false, error: 'Not your turn to respond' };
    }

    // 从等待列表中移除该玩家
    const waitingPlayers = this.state.pendingAction.waitingForPlayers || [];
    const newWaitingPlayers = waitingPlayers.filter(id => id !== playerId);
    
    // 找下一个有否决牌的玩家
    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    let nextPlayer: Player | null = null;
    
    for (const waitingId of newWaitingPlayers) {
      const candidate = this.state.players.find(p => p.id === waitingId);
      if (candidate && candidate.hand.some(c => c.type === CardType.NOPE)) {
        nextPlayer = candidate;
        break;
      }
    }

    if (nextPlayer) {
      // 还有人可以否决，询问下一个玩家
      this.state.pendingAction.playerId = nextPlayer.id;
      this.state.pendingAction.waitingForPlayers = newWaitingPlayers;
    } else {
      // 所有人都跳过了
      const nopeCount = this.state.pendingAction.nopeChainCount || 0;
      
      if (nopeCount % 2 === 0) {
        // 偶数次否决（包括0次），执行原动作
        this.executeOriginalAction();
      } else {
        // 奇数次否决，动作被取消
        this.state.pendingAction = null;
        this.state.phase = GamePhase.PLAYING;
      }
    }

    return { success: true };
  }

  // 统一的 Nope Window 处理逻辑
  private triggerActionWithNopeWindow(player: Player, cardTypeOrTypes: CardType | CardType[], action: () => void, pendingActionType: PendingActionType = PendingActionType.NONE): { success: boolean; needsTarget?: boolean } {
    const cardTypes = Array.isArray(cardTypeOrTypes) ? cardTypeOrTypes : [cardTypeOrTypes];
    const playersWithNope = this.getPlayersWithNope(player.id);
    
    if (playersWithNope.length > 0) {
      const playerIndex = this.state.players.findIndex(p => p.id === player.id);
      const firstNopePlayer = this.getNextPlayerWithNope(playerIndex, player.id);
      if (firstNopePlayer) {
        this.state.phase = GamePhase.NOPE_WINDOW;
        this.state.pendingAction = {
          type: PendingActionType.NOPE_WINDOW,
          playerId: firstNopePlayer.id,
          waitingForPlayers: playersWithNope,
          originalAction: {
            type: pendingActionType,
            playerId: player.id,
            cardTypes: cardTypes,
          },
          nopeChainCount: 0,
        };
        return { success: true, needsTarget: pendingActionType !== PendingActionType.NONE };
      }
    }
    
    // 无人有否决牌，直接执行动作
    if (pendingActionType !== PendingActionType.NONE) {
      // 需要后续交互的动作（如选择目标）
      this.state.pendingAction = {
        type: pendingActionType,
        playerId: player.id,
      };
      // 特殊处理 discard selection 需要 cards 参数
      if (pendingActionType === PendingActionType.SELECT_CARD_FROM_DISCARD) {
         this.state.pendingAction.cards = this.state.discardPile.filter(c => !this.state.lastPlayedCards.includes(c));
      }
      this.state.phase = GamePhase.AWAITING_ACTION;
      return { success: true, needsTarget: true };
    } else {
      // 立即执行的动作
      action();
      return { success: true };
    }
  }

  // 执行原始动作
  private executeOriginalAction(): void {
    if (!this.state.pendingAction?.originalAction) {
      this.state.pendingAction = null;
      this.state.phase = GamePhase.PLAYING;
      return;
    }

    const { type, playerId, cardTypes } = this.state.pendingAction.originalAction;
    const player = this.state.players.find(p => p.id === playerId);
    
    if (!player || !cardTypes || cardTypes.length === 0) {
      this.state.pendingAction = null;
      this.state.phase = GamePhase.PLAYING;
      return;
    }

    // 清除 pendingAction，准备执行动作
    this.state.pendingAction = null;
    this.state.phase = GamePhase.PLAYING;

    // 检查是否是 Combo
    if (cardTypes.length > 1) {
      // 简单的 Combo 判断逻辑
      if (cardTypes.length === 2) {
        // Two of a kind
        this.state.pendingAction = { type: PendingActionType.SELECT_PLAYER, playerId: player.id };
        this.state.phase = GamePhase.AWAITING_ACTION;
        return;
      } else if (cardTypes.length === 3) {
        // Three of a kind
        this.state.pendingAction = { type: PendingActionType.SELECT_PLAYER, playerId: player.id };
        this.state.phase = GamePhase.AWAITING_ACTION;
        return;
      } else if (cardTypes.length === 5) {
        // Five different
        if (this.state.discardPile.length > 0) {
          this.state.pendingAction = {
            type: PendingActionType.SELECT_CARD_FROM_DISCARD,
            playerId: player.id,
            cards: this.state.discardPile.filter(c => !this.state.lastPlayedCards.includes(c)),
          };
          this.state.phase = GamePhase.AWAITING_ACTION;
        }
        return;
      }
    }

    const cardType = cardTypes[0];

    // 根据卡牌类型执行具体逻辑
    switch (cardType) {
      case CardType.ATTACK:
        this.endTurnWithAttack(player, 2);
        break;
      case CardType.TARGETED_ATTACK:
        this.state.pendingAction = { type: PendingActionType.SELECT_PLAYER, playerId: player.id };
        this.state.phase = GamePhase.AWAITING_ACTION;
        break;
      case CardType.SKIP:
        this.endTurn();
        break;
      case CardType.SUPER_SKIP:
        player.turnsToTake = 0;
        this.endTurn();
        break;
      case CardType.FAVOR:
        this.state.pendingAction = { type: PendingActionType.SELECT_PLAYER, playerId: player.id };
        this.state.phase = GamePhase.AWAITING_ACTION;
        break;
      case CardType.SHUFFLE:
        this.shuffleDeck();
        break;
      case CardType.SEE_THE_FUTURE_3:
        this.state.pendingAction = { type: PendingActionType.VIEW_CARDS, playerId: player.id, cards: this.peekDeck(3), count: 3 };
        this.state.phase = GamePhase.AWAITING_ACTION;
        break;
      case CardType.SEE_THE_FUTURE_5:
        this.state.pendingAction = { type: PendingActionType.VIEW_CARDS, playerId: player.id, cards: this.peekDeck(5), count: 5 };
        this.state.phase = GamePhase.AWAITING_ACTION;
        break;
      case CardType.ALTER_THE_FUTURE_3:
        this.state.pendingAction = { type: PendingActionType.REORDER_CARDS, playerId: player.id, cards: this.peekDeck(3), count: 3 };
        this.state.phase = GamePhase.AWAITING_ACTION;
        break;
      case CardType.ALTER_THE_FUTURE_5:
        this.state.pendingAction = { type: PendingActionType.REORDER_CARDS, playerId: player.id, cards: this.peekDeck(5), count: 5 };
        this.state.phase = GamePhase.AWAITING_ACTION;
        break;
      case CardType.REVERSE:
        this.state.direction = this.state.direction === GameDirection.CLOCKWISE 
          ? GameDirection.COUNTER_CLOCKWISE 
          : GameDirection.CLOCKWISE;
        this.endTurn();
        break;
      case CardType.DRAW_FROM_BOTTOM:
        this.drawCardFromBottom(player);
        break;
      case CardType.GARBAGE_COLLECTION:
        this.startGarbageCollection(player.id);
        break;
      case CardType.CATOMIC_BOMB:
        this.executeCatomicBomb();
        break;
      case CardType.SWAP_TOP_AND_BOTTOM:
        this.swapTopAndBottom();
        break;
    }
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
      return { 
        ...this.triggerActionWithNopeWindow(player, cardTypes, () => {}, PendingActionType.SELECT_PLAYER),
        comboType 
      };
    }
    
    if (comboType === ComboType.THREE_OF_A_KIND) {
      this.addLog('played Three of a Kind', player.id, undefined, cardTypes);
      return { 
        ...this.triggerActionWithNopeWindow(player, cardTypes, () => {}, PendingActionType.SELECT_PLAYER),
        comboType
      };
    }
    
    if (comboType === ComboType.FIVE_DIFFERENT) {
      this.addLog('played Five Different Cards', player.id, undefined, cardTypes);
      return {
        ...this.triggerActionWithNopeWindow(player, cardTypes, () => {}, PendingActionType.SELECT_CARD_FROM_DISCARD),
        comboType
      };
    }

    return { success: false, error: 'Invalid combo' };
  }

  // Process card effect
  private processCardEffect(player: Player, card: Card): { success: boolean; needsTarget?: boolean } {
    switch (card.type) {
      case CardType.NOPE:
        // NOPE 的逻辑保持不变
        this.addLog('played Nope (no action to cancel)', player.id, undefined, [card.type]);
        return { success: true };

      case CardType.ATTACK:
        this.addLog('played Attack', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => this.endTurnWithAttack(player, 2));

      case CardType.TARGETED_ATTACK:
        this.addLog('played Targeted Attack', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => {}, PendingActionType.SELECT_PLAYER);

      case CardType.SKIP:
        this.addLog('played Skip', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => this.endTurn());

      case CardType.SUPER_SKIP:
        this.addLog('played Super Skip', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => {
          player.turnsToTake = 0;
          this.endTurn();
        });

      case CardType.FAVOR:
        this.addLog('played Favor', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => {}, PendingActionType.SELECT_PLAYER);

      case CardType.SHUFFLE:
        this.addLog('played Shuffle', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => this.shuffleDeck());

      case CardType.SEE_THE_FUTURE_3:
        this.addLog('played See the Future', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => {}, PendingActionType.VIEW_CARDS);

      case CardType.SEE_THE_FUTURE_5:
        this.addLog('played See the Future (5x)', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => {}, PendingActionType.VIEW_CARDS);

      case CardType.ALTER_THE_FUTURE_3:
        this.addLog('played Alter the Future', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => {}, PendingActionType.REORDER_CARDS);

      case CardType.ALTER_THE_FUTURE_5:
        this.addLog('played Alter the Future (5x)', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => {}, PendingActionType.REORDER_CARDS);

      case CardType.REVERSE:
        this.addLog('played Reverse', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => {
          this.state.direction = this.state.direction === GameDirection.CLOCKWISE 
            ? GameDirection.COUNTER_CLOCKWISE 
            : GameDirection.CLOCKWISE;
          this.endTurn();
        });

      case CardType.DRAW_FROM_BOTTOM:
        this.addLog('played Draw From Bottom', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => this.drawCardFromBottom(player));
      
      case CardType.SWAP_TOP_AND_BOTTOM:
        this.addLog('played Swap Top and Bottom', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => this.swapTopAndBottom());

      case CardType.GARBAGE_COLLECTION:
        this.addLog('played Garbage Collection', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => this.startGarbageCollection(player.id)); 

      case CardType.CATOMIC_BOMB:
        this.addLog('played Catomic Bomb!', player.id, undefined, [card.type]);
        return this.triggerActionWithNopeWindow(player, card.type, () => this.executeCatomicBomb());

      default:
        return { success: false };
    }
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

  // Execute garbage collection - start the process
  private startGarbageCollection(initiatorId: string): void {
    // Find all alive players who have cards
    const eligiblePlayers = this.state.players
      .filter(p => p.isAlive && p.hand.length > 0)
      .map(p => p.id);
    
    if (eligiblePlayers.length === 0) {
      this.addLog('no players have cards to recycle', initiatorId);
      this.state.pendingAction = null;
      this.state.phase = GamePhase.PLAYING;
      this.endTurn();
      return;
    }

    // Sort players starting from the next player after initiator (standard Uno/game direction)
    // Actually for fairness usually it starts from next player.
    // Let's just use the order in players array, rotated to start after current player (initiator)
    const initiatorIndex = this.state.players.findIndex(p => p.id === initiatorId);
    const playerCount = this.state.players.length;
    
    // Create ordered list of players starting from next player
    const orderedPlayers: string[] = [];
    for (let i = 1; i <= playerCount; i++) {
        const idx = (initiatorIndex + i) % playerCount;
        const p = this.state.players[idx];
        if (eligiblePlayers.includes(p.id)) {
            orderedPlayers.push(p.id);
        }
    }

    this.state.phase = GamePhase.AWAITING_ACTION;
    this.state.pendingAction = {
      type: PendingActionType.SELECT_CARD_FOR_GARBAGE,
      playerId: orderedPlayers[0],
      waitingForPlayers: orderedPlayers.slice(1), // Others wait
    };
    
    this.addLog('started Garbage Collection', initiatorId);
  }

  // Handle action: select card for garbage collection
  selectCardForGarbage(playerId: string, cardId: string): { success: boolean; error?: string } {
    if (!this.state.pendingAction || 
        this.state.pendingAction.type !== PendingActionType.SELECT_CARD_FOR_GARBAGE ||
        this.state.pendingAction.playerId !== playerId) {
      return { success: false, error: 'Not your turn to select for garbage' };
    }

    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { success: false, error: 'Card not found' };

    // Remove card and add to deck (will shuffle later)
    const card = player.hand.splice(cardIndex, 1)[0];
    this.state.deck.push(card);
    
    // Log privately or publicly? Publicly is fine as "Player gave a card"
    this.addLog('recycled a card', playerId);

    // Check if there are more players waiting
    if (this.state.pendingAction.waitingForPlayers && this.state.pendingAction.waitingForPlayers.length > 0) {
        const nextPlayerId = this.state.pendingAction.waitingForPlayers.shift();
        this.state.pendingAction.playerId = nextPlayerId!;
    } else {
        // All done
        this.shuffleDeck();
        this.addLog('Garbage Collection complete, deck shuffled');
        this.state.pendingAction = null;
        this.state.phase = GamePhase.PLAYING;
        this.endTurn();
    }

    return { success: true };
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
