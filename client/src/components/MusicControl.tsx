import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TRACK_NAMES } from '../hooks/useBackgroundMusic';
import './MusicControl.css';

interface MusicControlProps {
  isPlaying: boolean;
  volume: number;
  currentTrack: number;
  onTogglePlay: () => void;
  onVolumeChange: (volume: number) => void;
  onNextTrack: () => void;
}

export default function MusicControl({ 
  isPlaying, 
  volume, 
  currentTrack,
  onTogglePlay, 
  onVolumeChange,
  onNextTrack,
}: MusicControlProps) {
  const [showControls, setShowControls] = useState(false);

  return (
    <div 
      className="music-control"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <button 
        className={`music-btn ${isPlaying ? 'playing' : ''}`}
        onClick={onTogglePlay}
        title={isPlaying ? '暂停音乐' : '播放音乐'}
      >
        {isPlaying ? '🎵' : '🔇'}
      </button>

      <AnimatePresence>
        {showControls && (
          <motion.div 
            className="music-panel"
            initial={{ opacity: 0, x: 10, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 10, scale: 0.9 }}
            transition={{ duration: 0.15 }}
          >
            {/* 当前曲目 */}
            <div className="track-info">
              <span className="track-label">🎶</span>
              <span className="track-name">{TRACK_NAMES[currentTrack]}</span>
              <button 
                className="skip-btn"
                onClick={onNextTrack}
                title="下一首"
              >
                ⏭️
              </button>
            </div>

            {/* 音量控制 */}
            <div className="volume-row">
              <span className="volume-icon">🔊</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="volume-input"
              />
              <span className="volume-label">{Math.round(volume * 100)}%</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
