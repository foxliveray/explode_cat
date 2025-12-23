import { motion } from 'framer-motion';
import { Card as CardType, CARD_DEFINITIONS } from '@shared/types/cards';
import './Card.css';

interface CardProps {
  card: CardType;
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  onClick?: () => void;
}

export default function Card({ card, size = 'medium', disabled = false, onClick }: CardProps) {
  const def = CARD_DEFINITIONS[card.type];
  
  // Size dimensions
  const sizes = {
    small: { width: 70, height: 98 },
    medium: { width: 100, height: 140 },
    large: { width: 140, height: 196 },
  };

  const { width, height } = sizes[size];

  // Get card color based on category
  const getCardColor = () => {
    switch (def.category) {
      case 'exploding':
        return 'var(--gradient-danger)';
      case 'defuse':
        return 'var(--gradient-success)';
      case 'action':
        return 'var(--gradient-action)';
      case 'cat':
        return 'var(--gradient-cat)';
      default:
        return 'var(--gradient-card)';
    }
  };

  return (
    <motion.div 
      className={`card-component ${def.category} ${size} ${disabled ? 'disabled' : ''}`}
      style={{ 
        width, 
        height,
        '--card-color': getCardColor(),
      } as React.CSSProperties}
      onClick={!disabled ? onClick : undefined}
      whileHover={!disabled ? { scale: 1.05 } : undefined}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
    >
      <div className="card-inner">
        {/* Card Emoji */}
        <div className="card-emoji">{def.emoji}</div>
        
        {/* Card Name */}
        <div className="card-name">{def.nameZh}</div>
        
        {/* Card Description (only on large) */}
        {size === 'large' && (
          <div className="card-description">{def.descriptionZh}</div>
        )}
      </div>
    </motion.div>
  );
}
