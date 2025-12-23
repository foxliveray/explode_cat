import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocketStore } from '../stores/socketStore';
import Card from '../components/Card';
import PlayerPanel from '../components/PlayerPanel';
import ActionModal from '../components/ActionModal';
import GameLog from '../components/GameLog';
import CardRules from '../components/CardRules';
import './Game.css';

export default function Game() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { 
    gameState, 
    playCards, 
    drawCard, 
    error,
    leaveRoom,
  } = useSocketStore();
  
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

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

  // Toggle card selection
  const toggleCard = (cardId: string) => {
    if (!isCurrentPlayer || phase !== 'playing') return;
    
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
              <div className="deck-back">
                <span className="deck-count">{deckCount}</span>
                <span className="deck-label">牌堆</span>
              </div>
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
                onClick={() => toggleCard(card.id)}
                initial={{ opacity: 0, y: 50 }}
                animate={{ 
                  opacity: 1, 
                  y: selectedCards.includes(card.id) ? -20 : 0,
                }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -10, scale: 1.05 }}
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
        {!isCurrentPlayer && phase === 'playing' && (
          <div className="waiting-message">
            等待 {currentPlayer?.name} 行动...
          </div>
        )}
      </footer>

      {/* Action Modal */}
      {pendingAction && (
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
