import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSocketStore } from '../stores/socketStore';
import './Home.css';

export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { createRoom, joinRoom, room, error, isConnected } = useSocketStore();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  
  // Expansion settings
  const [implodingKittens, setImplodingKittens] = useState(true);
  const [streakingKittens, setStreakingKittens] = useState(true);

  // 从 URL 参数读取房间码
  useEffect(() => {
    const codeFromUrl = searchParams.get('code');
    if (codeFromUrl) {
      setRoomCode(codeFromUrl.toUpperCase());
      setMode('join');
    }
  }, [searchParams]);

  // Navigate when room is created/joined
  if (room) {
    navigate(`/room/${room.code}`);
  }

  const handleCreate = () => {
    if (playerName.trim()) {
      createRoom(playerName.trim(), {
        expansions: {
          implodingKittens,
          streakingKittens,
        }
      });
    }
  };

  const handleJoin = () => {
    if (playerName.trim() && roomCode.trim()) {
      joinRoom(roomCode.trim().toUpperCase(), playerName.trim());
    }
  };

  return (
    <div className="home page page-center">
      <motion.div 
        className="home-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Logo */}
        <div className="home-logo">
          <span className="logo-emoji">🐱💣</span>
          <h1 className="title">炸弹猫</h1>
          <p className="subtitle">Exploding Kittens</p>
        </div>

        {/* Connection Status */}
        <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          <span className="status-dot"></span>
          {isConnected ? '已连接服务器' : '正在连接...'}
        </div>

        {/* Error Message */}
        {error && (
          <motion.div 
            className="error-message"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            {error}
          </motion.div>
        )}

        {/* Menu */}
        {mode === 'menu' && (
          <motion.div 
            className="home-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <button 
              className="btn btn-primary btn-lg w-full"
              onClick={() => setMode('create')}
              disabled={!isConnected}
            >
              🎮 创建房间
            </button>
            <button 
              className="btn btn-secondary btn-lg w-full"
              onClick={() => setMode('join')}
              disabled={!isConnected}
            >
              🚪 加入房间
            </button>
            <div className="home-info">
              <p>支持 2-10 人游戏</p>
              <p>包含基础版 + 扩展包卡牌</p>
            </div>
          </motion.div>
        )}

        {/* Create Room */}
        {mode === 'create' && (
          <motion.div 
            className="home-form"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h2>创建新房间</h2>
            <input
              type="text"
              className="input"
              placeholder="输入你的昵称"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={12}
              autoFocus
            />
            
            {/* Expansion Selection */}
            <div className="expansion-selection">
              <h3>🎴 扩展包设置</h3>
              <label className="expansion-toggle">
                <input
                  type="checkbox"
                  checked={implodingKittens}
                  onChange={(e) => setImplodingKittens(e.target.checked)}
                />
                <span className="toggle-label">
                  <span className="toggle-emoji">🌀</span>
                  <span className="toggle-text">
                    <strong>内爆猫 Imploding Kittens</strong>
                    <small>反转、定向攻击、改变未来等</small>
                  </span>
                </span>
              </label>
              <label className="expansion-toggle">
                <input
                  type="checkbox"
                  checked={streakingKittens}
                  onChange={(e) => setStreakingKittens(e.target.checked)}
                />
                <span className="toggle-label">
                  <span className="toggle-emoji">🏃</span>
                  <span className="toggle-text">
                    <strong>裸奔猫 Streaking Kittens</strong>
                    <small>超级跳过、猫原子弹、垃圾回收等</small>
                  </span>
                </span>
              </label>
            </div>

            <div className="form-actions">
              <button 
                className="btn btn-ghost"
                onClick={() => setMode('menu')}
              >
                返回
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!playerName.trim()}
              >
                创建房间
              </button>
            </div>
          </motion.div>
        )}

        {/* Join Room */}
        {mode === 'join' && (
          <motion.div 
            className="home-form"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h2>加入房间</h2>
            <input
              type="text"
              className="input"
              placeholder="输入你的昵称"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={12}
            />
            <input
              type="text"
              className="input input-lg"
              placeholder="房间码"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
            <div className="form-actions">
              <button 
                className="btn btn-ghost"
                onClick={() => setMode('menu')}
              >
                返回
              </button>
              <button 
                className="btn btn-secondary"
                onClick={handleJoin}
                disabled={!playerName.trim() || roomCode.length !== 6}
              >
                加入房间
              </button>
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <div className="home-footer">
          <p>基于桌游《Exploding Kittens》</p>
        </div>
      </motion.div>
    </div>
  );
}
