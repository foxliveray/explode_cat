import { motion } from 'framer-motion';
import { CARD_DEFINITIONS, CardSource, CardCategory } from '@shared/types/cards';
import './CardRules.css';

interface CardRulesProps {
  onClose: () => void;
}

export default function CardRules({ onClose }: CardRulesProps) {
  // Group cards by source
  const baseCards = Object.values(CARD_DEFINITIONS).filter(c => c.source === CardSource.BASE);
  const implodingCards = Object.values(CARD_DEFINITIONS).filter(c => c.source === CardSource.IMPLODING_KITTENS);
  const streakingCards = Object.values(CARD_DEFINITIONS).filter(c => c.source === CardSource.STREAKING_KITTENS);

  const getCategoryLabel = (category: CardCategory) => {
    switch (category) {
      case CardCategory.EXPLODING: return '💣 爆炸牌';
      case CardCategory.DEFUSE: return '🔧 拆除牌';
      case CardCategory.ACTION: return '⚡ 动作牌';
      case CardCategory.CAT: return '🐱 猫牌';
      case CardCategory.SPECIAL: return '✨ 特殊牌';
      default: return category;
    }
  };

  const renderCardGroup = (cards: typeof baseCards, title: string) => (
    <div className="card-group">
      <h3>{title}</h3>
      <div className="cards-list">
        {cards.map(card => (
          <div key={card.type} className="rule-card">
            <div className="rule-card-header">
              <span className="card-emoji">{card.emoji}</span>
              <span className="card-name">{card.nameZh}</span>
              <span className="card-category">{getCategoryLabel(card.category)}</span>
            </div>
            <p className="card-desc">{card.descriptionZh}</p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <motion.div 
      className="card-rules-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="card-rules-modal">
        <header className="rules-header">
          <h2>📖 卡牌规则说明</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </header>

        <div className="rules-content">
          {/* Combo Rules */}
          <div className="combo-rules">
            <h3>🎯 猫牌组合技能</h3>
            <div className="combo-list">
              <div className="combo-item">
                <span className="combo-name">2张相同猫牌</span>
                <span className="combo-desc">随机偷取目标玩家一张牌</span>
              </div>
              <div className="combo-item">
                <span className="combo-name">3张相同猫牌</span>
                <span className="combo-desc">指定卡牌名称，从目标玩家偷取</span>
              </div>
              <div className="combo-item">
                <span className="combo-name">5张不同的牌</span>
                <span className="combo-desc">从弃牌堆选择一张牌加入手牌</span>
              </div>
            </div>
            <p className="combo-tip">💡 野猫(😼)可以替代任意猫牌</p>
          </div>

          {/* Base Cards */}
          {renderCardGroup(baseCards, '🎮 基础版')}

          {/* Imploding Kittens Expansion */}
          {renderCardGroup(implodingCards, '🌀 扩展包: 内爆猫')}

          {/* Streaking Kittens Expansion */}
          {renderCardGroup(streakingCards, '🏃 扩展包: 裸奔猫')}
        </div>
      </div>
    </motion.div>
  );
}
