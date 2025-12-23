import { motion } from 'framer-motion';
import type { GameLog as GameLogType } from '@shared/types/game';
import './GameLog.css';

interface GameLogProps {
  logs: GameLogType[];
  onClose: () => void;
}

export default function GameLog({ logs, onClose }: GameLogProps) {
  return (
    <motion.div 
      className="game-log-sidebar"
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
    >
      <div className="log-header">
        <h3>📜 游戏日志</h3>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>
      
      <div className="log-list">
        {logs.slice().reverse().map((log, index) => (
          <div key={index} className="log-entry">
            <span className="log-time">
              {new Date(log.timestamp).toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
              })}
            </span>
            <span className="log-content">
              {log.playerName && <strong>{log.playerName}</strong>}
              {' '}{log.action}
              {log.targetPlayerName && <> → <strong>{log.targetPlayerName}</strong></>}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
