import { v4 as uuidv4 } from 'uuid';
import { Card, CardType, CardSource, CARD_DEFINITIONS } from '../types/cards';
import { RoomSettings } from '../types/game';

export class Deck {
  private cards: Card[] = [];

  constructor() {}

  // Create a standard deck based on player count and expansions
  static createDeck(playerCount: number, settings: RoomSettings): Deck {
    const deck = new Deck();
    
    // Add base game cards (except Exploding Kitten and Defuse)
    for (const [type, def] of Object.entries(CARD_DEFINITIONS)) {
      const cardType = type as CardType;
      
      // Skip special cards that are handled separately
      if (cardType === CardType.EXPLODING_KITTEN || cardType === CardType.DEFUSE) {
        continue;
      }
      
      // Skip imploding kittens expansion cards if not enabled
      if (def.source === CardSource.IMPLODING_KITTENS && !settings.expansions.implodingKittens) {
        continue;
      }
      
      // Skip streaking kittens expansion cards if not enabled
      if (def.source === CardSource.STREAKING_KITTENS && !settings.expansions.streakingKittens) {
        continue;
      }

      // Skip Imploding Kitten card (added later)
      if (cardType === CardType.IMPLODING_KITTEN) {
        continue;
      }

      // Add cards based on count
      for (let i = 0; i < def.count; i++) {
        deck.cards.push({
          id: uuidv4(),
          type: cardType,
        });
      }
    }

    return deck;
  }

  // Add a card to the deck
  addCard(card: Card, position?: number): void {
    if (position === undefined || position >= this.cards.length) {
      this.cards.push(card);
    } else if (position <= 0) {
      this.cards.unshift(card);
    } else {
      this.cards.splice(position, 0, card);
    }
  }

  // Draw a card from the top
  drawTop(): Card | undefined {
    return this.cards.shift();
  }

  // Draw a card from the bottom
  drawBottom(): Card | undefined {
    return this.cards.pop();
  }

  // Shuffle the deck using Fisher-Yates algorithm
  shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  // View top N cards
  peekTop(count: number): Card[] {
    return this.cards.slice(0, count);
  }

  // Reorder top N cards
  reorderTop(cardIds: string[]): boolean {
    const count = cardIds.length;
    const topCards = this.cards.slice(0, count);
    
    // Verify all cardIds match
    const topCardIds = new Set(topCards.map(c => c.id));
    if (!cardIds.every(id => topCardIds.has(id))) {
      return false;
    }

    // Reorder
    const reordered = cardIds.map(id => topCards.find(c => c.id === id)!);
    for (let i = 0; i < count; i++) {
      this.cards[i] = reordered[i];
    }
    return true;
  }

  // Swap top and bottom cards
  swapTopAndBottom(): void {
    if (this.cards.length >= 2) {
      const temp = this.cards[0];
      this.cards[0] = this.cards[this.cards.length - 1];
      this.cards[this.cards.length - 1] = temp;
    }
  }

  // Insert exploding kitten at specific position
  insertExplodingKitten(card: Card, position: number): void {
    // Clamp position
    const pos = Math.max(0, Math.min(position, this.cards.length));
    this.cards.splice(pos, 0, card);
  }

  // Get deck size
  get size(): number {
    return this.cards.length;
  }

  // Get all cards (for debugging)
  getAllCards(): Card[] {
    return [...this.cards];
  }

  // Remove all exploding kittens and return them
  removeAllExplodingKittens(): Card[] {
    const explodingKittens: Card[] = [];
    this.cards = this.cards.filter(card => {
      if (card.type === CardType.EXPLODING_KITTEN) {
        explodingKittens.push(card);
        return false;
      }
      return true;
    });
    return explodingKittens;
  }

  // Insert multiple exploding kittens at the top
  insertExplodingKittensAtTop(cards: Card[]): void {
    this.cards = [...cards, ...this.cards];
  }

  // Create initial Defuse cards for dealing
  static createDefuseCards(count: number): Card[] {
    const cards: Card[] = [];
    for (let i = 0; i < count; i++) {
      cards.push({
        id: uuidv4(),
        type: CardType.DEFUSE,
      });
    }
    return cards;
  }

  // Create Exploding Kitten cards
  static createExplodingKittens(count: number): Card[] {
    const cards: Card[] = [];
    for (let i = 0; i < count; i++) {
      cards.push({
        id: uuidv4(),
        type: CardType.EXPLODING_KITTEN,
      });
    }
    return cards;
  }

  // Create Imploding Kitten card
  static createImplodingKitten(): Card {
    return {
      id: uuidv4(),
      type: CardType.IMPLODING_KITTEN,
      faceUp: false,
    };
  }
}
