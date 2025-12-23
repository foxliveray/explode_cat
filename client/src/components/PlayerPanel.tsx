import { motion } from 'framer-motion';
import type { ClientPlayer } from '@shared/types/game';
import './PlayerPanel.css';

interface PlayerPanelProps {
  player: ClientPlayer;
  isCurrentTurn: boolean;
  position: number;
}

export default function PlayerPanel({ player, isCurrentTurn, position }: PlayerPanelProps) {
  return (
    <motion.div 
      className={`player-panel ${isCurrentTurn ? 'current-turn' : ''} ${!player.isAlive ? 'dead' : ''}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: position * 0.1 }}
    >
      {/* Avatar */}
      <div className="panel-avatar">
        {!player.isAlive ? '💀' : player.isHost ? '👑' : '🐱'}
      </div>

      {/* Info */}
      <div className="panel-info">
        <span className="panel-name">{player.name}</span>
        <span className="panel-cards">🃏 {player.cardCount}</span>
      </div>

      {/* Status */}
      {isCurrentTurn && player.isAlive && (
        <div className="turn-badge">
          当前回合
        </div>
      )}

      {player.turnsToTake > 1 && (
        <div className="turns-badge">
          x{player.turnsToTake}
        </div>
      )}

      {!player.isAlive && (
        <div className="dead-overlay">
          <span>已爆炸</span>
        </div>
      )}
    </motion.div>
  );
}
