import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSocketStore } from '../stores/socketStore';
import Card from './Card';
import type { PendingAction, ClientPlayer } from '@shared/types/game';
import type { Card as CardType, CardType as CardTypeEnum } from '@shared/types/cards';
import './ActionModal.css';

interface ActionModalProps {
  action: PendingAction;
  players: ClientPlayer[];
  discardPile: CardType[];
  myHand: CardType[];
  deckCount: number;
  myId: string; // Add myId prop
}

export default function ActionModal({ 
  action, 
  players, 
  discardPile,
  myHand,
  deckCount,
  myId 
}: ActionModalProps) {
  const { 
    selectPlayer, 
    selectCardName, 
    giveCard, 
    selectCardFromDiscard,
    placeExplodingKitten,
    reorderCards 
  } = useSocketStore();

  const [selectedPosition, setSelectedPosition] = useState(0);

  const isMyAction = action.playerId === myId;

  // Select Player
  if (action.type === 'select_player' && isMyAction) {
    return (
      <motion.div 
        className="action-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="action-modal">
          <h2>选择目标玩家</h2>
          <div className="player-select-grid">
            {players
              .filter(p => p.id !== myId && p.isAlive)
              .map(player => (
                <button 
                  key={player.id}
                  className="player-select-btn"
                  onClick={() => selectPlayer(player.id)}
                >
                  <span className="player-emoji">🐱</span>
                  <span className="player-name">{player.name}</span>
                  <span className="player-cards">🃏 {player.cardCount}</span>
                </button>
              ))}
          </div>
        </div>
      </motion.div>
    );
  }

  // Select Card Name (Three of a Kind)
  if (action.type === 'select_card_name' && isMyAction) {
    const cardTypes: CardTypeEnum[] = [
      'defuse', 'nope', 'attack', 'skip', 'favor', 'shuffle', 
      'see_the_future_3', 'taco_cat', 'hairy_potato_cat', 
      'cattermelon', 'rainbow_ralphing_cat', 'beard_cat'
    ] as CardTypeEnum[];

    return (
      <motion.div 
        className="action-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="action-modal">
          <h2>指定要偷的卡牌</h2>
          <p className="action-hint">选择你想要的卡牌类型</p>
          <div className="card-type-grid">
            {cardTypes.map(type => (
              <button 
                key={type}
                className="card-type-btn"
                onClick={() => selectCardName(type)}
              >
                {type.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  // Give Card (Favor)
  if (action.type === 'select_card_to_give' && isMyAction) {
    return (
      <motion.div 
        className="action-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="action-modal">
          <h2>选择要给出的牌</h2>
          <p className="action-hint">从你的手牌中选择一张给对方</p>
          <div className="cards-grid">
            {myHand.map(card => (
              <div 
                key={card.id}
                className="selectable-card"
                onClick={() => giveCard(card.id)}
              >
                <Card card={card} size="small" />
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  // Select from Discard (Five Different)
  if (action.type === 'select_card_from_discard' && isMyAction) {
    return (
      <motion.div 
        className="action-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="action-modal wide">
          <h2>从弃牌堆选择</h2>
          <p className="action-hint">选择一张卡牌加入你的手牌</p>
          <div className="cards-grid scrollable">
            {discardPile.map(card => (
              <div 
                key={card.id}
                className="selectable-card"
                onClick={() => selectCardFromDiscard(card.id)}
              >
                <Card card={card} size="small" />
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  // Place Exploding Kitten
  if (action.type === 'place_exploding_kitten' && isMyAction) {
    return (
      <motion.div 
        className="action-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="action-modal">
          <h2>🔧 拆弹成功!</h2>
          <p className="action-hint">选择炸弹猫放回的位置 (0 = 最顶部)</p>
          
          <div className="position-slider">
            <input 
              type="range"
              min={0}
              max={deckCount}
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(Number(e.target.value))}
            />
            <div className="position-labels">
              <span>顶部 (0)</span>
              <span className="current-position">{selectedPosition}</span>
              <span>底部 ({deckCount})</span>
            </div>
          </div>

          <button 
            className="btn btn-primary btn-lg"
            onClick={() => placeExplodingKitten(selectedPosition)}
          >
            确认放置
          </button>
        </div>
      </motion.div>
    );
  }

  // View Cards (See the Future - only viewing, no reorder)
  if (action.type === 'view_cards' && isMyAction && action.cards) {
    const { dismissViewCards } = useSocketStore.getState();
    return (
      <motion.div 
        className="action-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="action-modal">
          <h2>🔮 预见未来</h2>
          <p className="action-hint">这是牌堆顶部的牌 (左边是最顶)</p>
          
          <div className="reorder-cards">
            {action.cards.map((card, index) => (
              <div key={card.id} className="reorder-card">
                <span className="card-position">{index + 1}</span>
                <Card card={card} size="small" />
              </div>
            ))}
          </div>

          <button 
            className="btn btn-primary btn-lg"
            onClick={() => dismissViewCards()}
          >
            确认
          </button>
        </div>
      </motion.div>
    );
  }

  // Garbage Collection
  if (action.type === 'select_card_for_garbage' && isMyAction) {
    const { selectCardForGarbage } = useSocketStore();
    return (
      <motion.div 
        className="action-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="action-modal">
          <h2>🗑️ 垃圾回收</h2>
          <p className="action-hint">所有玩家必须选一张牌放回牌堆</p>
          <div className="cards-grid">
            {myHand.map(card => (
              <div 
                key={card.id}
                className="selectable-card"
                onClick={() => selectCardForGarbage(card.id)}
              >
                <Card card={card} size="small" />
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  // Reorder Cards (Alter the Future)
  if (action.type === 'reorder_cards' && isMyAction && action.cards) {
    // Use a local component to manage state
    const ReorderCardsModal = () => {
      const [cards, setCards] = useState<CardType[]>(action.cards || []);
      const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

      const handleCardClick = (index: number) => {
        if (selectedIndex === null) {
          // First click - select this card
          setSelectedIndex(index);
        } else if (selectedIndex === index) {
          // Same card clicked - deselect
          setSelectedIndex(null);
        } else {
          // Different card clicked - swap them
          const newCards = [...cards];
          [newCards[selectedIndex], newCards[index]] = [newCards[index], newCards[selectedIndex]];
          setCards(newCards);
          setSelectedIndex(null);
        }
      };

      return (
        <motion.div 
          className="action-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="action-modal">
            <h2>✨ 改变未来</h2>
            <p className="action-hint">点击两张牌交换它们的位置 (左边是最顶)</p>
            
            <div className="reorder-cards">
              {cards.map((card, index) => (
                <div 
                  key={card.id} 
                  className={`reorder-card ${selectedIndex === index ? 'selected' : ''}`}
                  onClick={() => handleCardClick(index)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="card-position">{index + 1}</span>
                  <Card card={card} size="small" />
                </div>
              ))}
            </div>

            <p className="action-hint small">
              {selectedIndex !== null ? '点击另一张牌交换位置' : '点击选择要移动的牌'}
            </p>

            <button 
              className="btn btn-primary btn-lg"
              onClick={() => reorderCards(cards.map(c => c.id))}
            >
              确认排列
            </button>
          </div>
        </motion.div>
      );
    };

    return <ReorderCardsModal />;
  }

  // Waiting for other player
  if (!isMyAction) {
    const actionPlayer = players.find(p => p.id === action.playerId);
    return (
      <motion.div 
        className="action-modal-overlay transparent"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="waiting-indicator">
          <span className="waiting-emoji">⏳</span>
          <span>等待 {actionPlayer?.name} 行动...</span>
        </div>
      </motion.div>
    );
  }

  return null;
}
