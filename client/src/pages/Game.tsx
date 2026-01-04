import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocketStore } from '../stores/socketStore';
import Card from '../components/Card';
import PlayerPanel from '../components/PlayerPanel';
import ActionModal from '../components/ActionModal';
import GameLog from '../components/GameLog';
import CardRules from '../components/CardRules';
import MusicControl from '../components/MusicControl';
import { useBackgroundMusic } from '../hooks/useBackgroundMusic';
import './Game.css';

export default function Game() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { 
    gameState, 
    playCards, 
    drawCard,
    playNope,
    passNope,
    error,
    leaveRoom,
  } = useSocketStore();
  
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  
  // 背景音乐
  const { isPlaying, volume, currentTrack, togglePlay, setVolume, nextTrack } = useBackgroundMusic();

  // Navigate home if no game
  useEffect(() => {
    if (!gameState) {
      navigate('/');
    }
  }, [gameState, navigate]);

  if (!gameState) return null;

  const { 
    players, 
    currentPlayerIndex, 
    myHand, 
    myIndex, 
    deckCount, 
    discardPile,
    phase,
    pendingAction,
    winner,
    direction,
  } = gameState;

  const isCurrentPlayer = myIndex === currentPlayerIndex;
  const currentPlayer = players[currentPlayerIndex];

  // 检查一张卡是否是 NOPE 卡
  const isNopeCard = (cardId: string) => {
    const card = myHand.find(c => c.id === cardId);
    return card?.type === 'nope';
  };

  // 检查手牌中是否有 NOPE 卡
  const hasNopeCard = myHand.some(c => c.type === 'nope');

  // 检查是否在否决窗口且轮到自己响应
  const isMyNopeWindow = pendingAction?.type === 'nope_window' && 
    pendingAction.playerId === gameState.myId;

  // 是否可以打出否决牌
  const canPlayNope = isMyNopeWindow && hasNopeCard;

  // Toggle card selection
  const toggleCard = (cardId: string) => {
    // 正常情况：是自己回合且在 playing 阶段
    const isNormalTurn = isCurrentPlayer && phase === 'playing';
    // 特殊情况：可以否决时允许选择 NOPE 卡
    const canSelectNope = canPlayNope && isNopeCard(cardId);
    
    if (!isNormalTurn && !canSelectNope) return;
    
    setSelectedCards(prev => 
      prev.includes(cardId) 
        ? prev.filter(id => id !== cardId)
        : [...prev, cardId]
    );
  };

  // Play selected cards
  const handlePlayCards = () => {
    if (selectedCards.length === 0) return;
    playCards(selectedCards);
    setSelectedCards([]);
  };

  // Draw a card
  const handleDrawCard = () => {
    if (!isCurrentPlayer) return;
    drawCard();
    setSelectedCards([]);
  };

  // Get top discard card
  const topDiscard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;

  return (
    <div className="game page">
      {/* Game Header */}
      <header className="game-header">
        <div className="game-info">
          <span className="room-code">房间 {code}</span>
          <span className="turn-info">
            回合 {gameState.turnCount} | {direction === 1 ? '→' : '←'}
          </span>
        </div>
        <div className="header-buttons">
          <MusicControl
            isPlaying={isPlaying}
            volume={volume}
            currentTrack={currentTrack}
            onTogglePlay={togglePlay}
            onVolumeChange={setVolume}
            onNextTrack={nextTrack}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => setShowRules(true)}>
            📖 规则
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowLog(!showLog)}>
            📜 日志
          </button>
          <button className="btn btn-ghost btn-sm btn-danger" onClick={() => setShowQuitConfirm(true)}>
            🚪 退出
          </button>
        </div>
      </header>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            className="error-toast"
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Log Sidebar */}
      <AnimatePresence>
        {showLog && (
          <GameLog logs={gameState.logs} onClose={() => setShowLog(false)} />
        )}
      </AnimatePresence>

      {/* Main Game Area */}
      <main className="game-main">
        {/* Other Players */}
        <div className="other-players">
          {players.map((player, index) => 
            index !== myIndex && (
              <PlayerPanel 
                key={player.id}
                player={player}
                isCurrentTurn={index === currentPlayerIndex}
                position={index}
              />
            )
          )}
        </div>

        {/* Center Area - Deck & Discard */}
        <div className="center-area">
          {/* Current Turn Indicator */}
          <div className="turn-indicator">
            <span className={isCurrentPlayer ? 'your-turn' : ''}>
              {isCurrentPlayer ? '🎯 你的回合!' : `等待 ${currentPlayer?.name}...`}
            </span>
            {currentPlayer?.turnsToTake > 1 && (
              <span className="extra-turns">还需抽 {currentPlayer.turnsToTake} 次牌</span>
            )}
          </div>

          {/* Deck & Discard */}
          <div className="deck-area">
            {/* Deck */}
            <div 
              className={`deck ${isCurrentPlayer ? 'clickable' : ''}`}
              onClick={handleDrawCard}
            >
              {gameState.topDeckCard ? (
                <div className="deck-top-face-up">
                  <Card card={gameState.topDeckCard} size="medium" />
                  <div className="deck-warning-overlay">
                    <span>⚠️ 危险!</span>
                  </div>
                  <span className="deck-count-badge">{deckCount}</span>
                </div>
              ) : (
                <div className="deck-back">
                  <span className="deck-count">{deckCount}</span>
                  <span className="deck-label">牌堆</span>
                </div>
              )}
            </div>

            {/* Discard Pile */}
            <div className="discard-pile">
              {topDiscard ? (
                <Card card={topDiscard} size="medium" disabled />
              ) : (
                <div className="discard-empty">
                  <span>弃牌堆</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* My Hand */}
        <div className="my-hand-area">
          <div className="hand-label">我的手牌 ({myHand.length})</div>
          <div className="my-hand">
            {myHand.map((card, index) => (
              <motion.div
                key={card.id}
                className={`hand-card ${selectedCards.includes(card.id) ? 'selected' : ''}`}
                style={{ zIndex: index }}
                onClick={() => toggleCard(card.id)}
                initial={{ opacity: 0, y: 30 }}
                animate={{ 
                  opacity: 1, 
                  y: selectedCards.includes(card.id) ? -20 : 0,
                }}
                transition={{ 
                  type: 'spring',
                  stiffness: 300,
                  damping: 25,
                }}
                whileHover={{ 
                  y: selectedCards.includes(card.id) ? -20 : -10,
                }}
              >
                <Card card={card} size="medium" />
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      {/* Action Bar */}
      <footer className="action-bar">
        {isCurrentPlayer && phase === 'playing' && (
          <>
            <button 
              className="btn btn-primary btn-lg"
              onClick={handlePlayCards}
              disabled={selectedCards.length === 0}
            >
              🃏 出牌 {selectedCards.length > 0 && `(${selectedCards.length})`}
            </button>
            <button 
              className="btn btn-secondary btn-lg"
              onClick={handleDrawCard}
            >
              📥 抽牌
            </button>
          </>
        )}
        {!isCurrentPlayer && phase === 'playing' && !isMyNopeWindow && (
          <div className="waiting-message">
            等待 {currentPlayer?.name} 行动...
          </div>
        )}
        {isMyNopeWindow && (
          <div className="nope-action">
            <span className="nope-hint">
              🚫 {pendingAction?.originalAction?.cardTypes?.length 
                ? `有人打出了卡牌，要否决吗？` 
                : '有动作可以否决！'}
            </span>
            <div className="nope-buttons">
              <button 
                className="btn btn-danger btn-lg"
                onClick={() => {
                  if (selectedCards.length > 0 && selectedCards.every(isNopeCard)) {
                    playNope(selectedCards[0]);
                    setSelectedCards([]);
                  }
                }}
                disabled={selectedCards.length === 0 || !selectedCards.every(isNopeCard)}
              >
                🚫 打出否决牌
              </button>
              <button 
                className="btn btn-ghost btn-lg"
                onClick={() => passNope()}
              >
                ⏭️ 跳过
              </button>
            </div>
          </div>
        )}
      </footer>

      {/* Action Modal - 非否决窗口期间显示 */}
      {pendingAction && pendingAction.type !== 'nope_window' && (
        <ActionModal 
          action={pendingAction}
          players={players}
          discardPile={discardPile}
          myHand={myHand}
          deckCount={deckCount}
          myId={gameState.myId}
        />
      )}

      {/* Game Over Modal */}
      {phase === 'game_over' && winner && (
        <motion.div 
          className="game-over-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="game-over-modal">
            <h1>🎉 游戏结束!</h1>
            <div className="winner-name">
              {winner.id === gameState.myId ? '🏆 你赢了!' : `${winner.name} 获胜!`}
            </div>
            <button 
              className="btn btn-primary btn-lg"
              onClick={() => navigate('/')}
            >
              返回首页
            </button>
          </div>
        </motion.div>
      )}

      {/* Card Rules Modal */}
      <AnimatePresence>
        {showRules && (
          <CardRules onClose={() => setShowRules(false)} />
        )}
      </AnimatePresence>

      {/* Quit Confirm Modal */}
      <AnimatePresence>
        {showQuitConfirm && (
          <motion.div 
            className="quit-confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="quit-confirm-modal">
              <h2>🚪 确认退出</h2>
              <p>确定要退出游戏吗？你将被视为爆炸出局。</p>
              <div className="quit-buttons">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setShowQuitConfirm(false)}
                >
                  取消
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={() => {
                    leaveRoom();
                    navigate('/');
                  }}
                >
                  确认退出
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
