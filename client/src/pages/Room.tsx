import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSocketStore } from '../stores/socketStore';
import './Room.css';

export default function Room() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { room, playerId, gameState, leaveRoom, setReady, startGame, error } = useSocketStore();

  // Navigate to game when current room's game starts
  useEffect(() => {
    if (room?.isGameStarted && gameState) {
      navigate(`/game/${code}`);
    }
  }, [room?.isGameStarted, gameState, code, navigate]);

  // Navigate home if no room
  useEffect(() => {
    if (!room) {
      navigate('/');
    }
  }, [room, navigate]);

  if (!room) return null;

  const currentPlayer = room.players.find(p => p.socketId === playerId);
  const isHost = currentPlayer?.isHost || false;
  const isReady = currentPlayer?.isReady || false;
  // Host doesn't need to be ready, only check non-host players
  const allReady = room.players.filter(p => !p.isHost).every(p => p.isReady);
  const canStart = isHost && room.players.length >= 2 && allReady;

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room.code);
  };

  return (
    <div className="room page">
      {/* Header */}
      <header className="room-header">
        <button className="btn btn-ghost btn-sm" onClick={handleLeave}>
          ← 离开房间
        </button>
        <div className="room-code-display" onClick={copyRoomCode}>
          <span className="code-label">房间码</span>
          <span className="code-value">{room.code}</span>
          <span className="code-copy">📋</span>
        </div>
      </header>

      {/* Error */}
      {error && (
        <motion.div 
          className="error-banner"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {error}
        </motion.div>
      )}

      {/* Main Content */}
      <main className="room-content">
        {/* Players Grid */}
        <section className="players-section">
          <h2>玩家 ({room.players.length}/{room.maxPlayers})</h2>
          <div className="players-grid">
            {room.players.map((player, index) => (
              <motion.div 
                key={player.id}
                className={`player-card ${player.isReady ? 'ready' : ''} ${player.isHost ? 'host' : ''}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="player-avatar">
                  {player.isHost ? '👑' : '🐱'}
                </div>
                <div className="player-info">
                  <span className="player-name">{player.name}</span>
                  <span className="player-status">
                    {player.isHost ? '房主' : player.isReady ? '已准备' : '等待中'}
                  </span>
                </div>
                {player.isReady && <span className="ready-badge">✓</span>}
              </motion.div>
            ))}
            
            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 4 - room.players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="player-card empty">
                <div className="player-avatar">❓</div>
                <span className="player-name">等待加入...</span>
              </div>
            ))}
          </div>
        </section>

        {/* Settings */}
        <section className="settings-section card">
          <h3>游戏设置</h3>
          <div className="settings-list">
            <div className="setting-item">
              <span>💥 Imploding Kittens 扩展</span>
              <span className={room.settings.expansions.implodingKittens ? 'enabled' : 'disabled'}>
                {room.settings.expansions.implodingKittens ? '✓ 启用' : '✗ 关闭'}
              </span>
            </div>
            <div className="setting-item">
              <span>🏃 Streaking Kittens 扩展</span>
              <span className={room.settings.expansions.streakingKittens ? 'enabled' : 'disabled'}>
                {room.settings.expansions.streakingKittens ? '✓ 启用' : '✗ 关闭'}
              </span>
            </div>
          </div>
        </section>

        {/* Rules Preview */}
        <section className="rules-section card card-glass">
          <h3>🃏 卡牌说明</h3>
          <div className="rules-preview">
            <p>💣 <strong>炸弹猫</strong> - 抽到即爆炸</p>
            <p>🔧 <strong>拆除</strong> - 拆除炸弹放回牌堆</p>
            <p>⚔️ <strong>攻击</strong> - 下家抽2次</p>
            <p>⏭️ <strong>跳过</strong> - 跳过本回合</p>
            <p>🐱 <strong>猫牌</strong> - 2张偷牌/3张指定偷</p>
          </div>
        </section>
      </main>

      {/* Footer Actions */}
      <footer className="room-footer">
        {!isHost && (
          <button 
            className={`btn ${isReady ? 'btn-outline' : 'btn-secondary'} btn-lg`}
            onClick={() => setReady(!isReady)}
          >
            {isReady ? '取消准备' : '准备'}
          </button>
        )}
        {isHost && (
          <button 
            className="btn btn-primary btn-lg animate-pulse"
            onClick={startGame}
            disabled={!canStart}
          >
            {room.players.length < 2 
              ? '等待更多玩家...' 
              : !allReady 
                ? '等待所有玩家准备...' 
                : '🚀 开始游戏'}
          </button>
        )}
      </footer>
    </div>
  );
}
