import { useEffect, useRef, useState, useCallback } from 'react';

interface UseBGMResult {
  isPlaying: boolean;
  volume: number;
  currentTrack: number;
  togglePlay: () => void;
  setVolume: (volume: number) => void;
  nextTrack: () => void;
}

// 定义多种音乐风格
const MUSIC_PATTERNS = [
  {
    name: '欢快节拍',
    bpm: 120,
    notes: [
      { freq: 523.25, dur: 0.1 },  // C5
      { freq: 659.25, dur: 0.1 },  // E5
      { freq: 783.99, dur: 0.1 },  // G5
      { freq: 659.25, dur: 0.1 },  // E5
      { freq: 523.25, dur: 0.15 }, // C5
      { freq: 392.00, dur: 0.15 }, // G4
    ],
  },
  {
    name: '紧张氛围',
    bpm: 140,
    notes: [
      { freq: 293.66, dur: 0.08 }, // D4
      { freq: 311.13, dur: 0.08 }, // D#4
      { freq: 293.66, dur: 0.08 }, // D4
      { freq: 261.63, dur: 0.15 }, // C4
      { freq: 233.08, dur: 0.2 },  // Bb3
    ],
  },
  {
    name: '轻松旋律',
    bpm: 100,
    notes: [
      { freq: 440.00, dur: 0.15 }, // A4
      { freq: 493.88, dur: 0.15 }, // B4
      { freq: 523.25, dur: 0.2 },  // C5
      { freq: 493.88, dur: 0.1 },  // B4
      { freq: 440.00, dur: 0.2 },  // A4
      { freq: 392.00, dur: 0.25 }, // G4
    ],
  },
  {
    name: '神秘音调',
    bpm: 90,
    notes: [
      { freq: 329.63, dur: 0.2 },  // E4
      { freq: 349.23, dur: 0.15 }, // F4
      { freq: 329.63, dur: 0.15 }, // E4
      { freq: 293.66, dur: 0.2 },  // D4
      { freq: 329.63, dur: 0.3 },  // E4
    ],
  },
  {
    name: '冒险进行曲',
    bpm: 130,
    notes: [
      { freq: 392.00, dur: 0.1 },  // G4
      { freq: 392.00, dur: 0.1 },  // G4
      { freq: 392.00, dur: 0.1 },  // G4
      { freq: 311.13, dur: 0.3 },  // Eb4
      { freq: 349.23, dur: 0.1 },  // F4
      { freq: 349.23, dur: 0.1 },  // F4
      { freq: 349.23, dur: 0.1 },  // F4
      { freq: 293.66, dur: 0.3 },  // D4
    ],
  },
];

class MultiTrackBackgroundMusic {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying = false;
  private intervalId: number | null = null;
  private volume = 0.3;
  private currentPatternIndex = 0;
  private beatCount = 0;
  private onTrackChange: ((index: number) => void) | null = null;

  init() {
    if (this.audioContext) return;
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.gainNode.gain.value = this.volume;
  }

  setOnTrackChange(callback: (index: number) => void) {
    this.onTrackChange = callback;
  }

  playNote(frequency: number, duration: number, delay: number = 0, type: OscillatorType = 'sine') {
    if (!this.audioContext || !this.gainNode) return;

    const oscillator = this.audioContext.createOscillator();
    const noteGain = this.audioContext.createGain();
    
    oscillator.connect(noteGain);
    noteGain.connect(this.gainNode);
    
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    
    const now = this.audioContext.currentTime + delay;
    noteGain.gain.setValueAtTime(0.25, now);
    noteGain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  playCurrentPattern() {
    const pattern = MUSIC_PATTERNS[this.currentPatternIndex];
    const beatDuration = 60 / pattern.bpm;
    
    let delay = 0;
    pattern.notes.forEach((note) => {
      this.playNote(note.freq, note.dur, delay, 'triangle');
      delay += beatDuration * 0.5;
    });
  }

  nextPattern() {
    this.currentPatternIndex = (this.currentPatternIndex + 1) % MUSIC_PATTERNS.length;
    this.onTrackChange?.(this.currentPatternIndex);
  }

  start() {
    if (this.isPlaying) return;
    this.init();
    
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
    
    this.isPlaying = true;
    this.beatCount = 0;
    this.playCurrentPattern();
    
    const pattern = MUSIC_PATTERNS[this.currentPatternIndex];
    const loopInterval = (60 / pattern.bpm) * pattern.notes.length * 0.5 * 1000;
    
    this.intervalId = window.setInterval(() => {
      this.beatCount++;
      
      // 每播放 8 次后切换到下一首
      if (this.beatCount >= 8) {
        this.beatCount = 0;
        this.nextPattern();
        
        // 更新循环间隔
        if (this.intervalId) {
          clearInterval(this.intervalId);
          const newPattern = MUSIC_PATTERNS[this.currentPatternIndex];
          const newInterval = (60 / newPattern.bpm) * newPattern.notes.length * 0.5 * 1000;
          this.intervalId = window.setInterval(() => {
            this.beatCount++;
            if (this.beatCount >= 8) {
              this.beatCount = 0;
              this.nextPattern();
            }
            this.playCurrentPattern();
          }, newInterval);
        }
      }
      
      this.playCurrentPattern();
    }, loopInterval);
  }

  stop() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  skipToNext() {
    this.beatCount = 0;
    this.nextPattern();
    if (this.isPlaying) {
      this.stop();
      this.start();
    }
  }

  setVolume(vol: number) {
    this.volume = vol;
    if (this.gainNode) {
      this.gainNode.gain.value = vol;
    }
  }

  getCurrentPatternIndex() {
    return this.currentPatternIndex;
  }

  getPatternName() {
    return MUSIC_PATTERNS[this.currentPatternIndex].name;
  }

  getIsPlaying() {
    return this.isPlaying;
  }

  destroy() {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export function useBackgroundMusic(): UseBGMResult {
  const musicRef = useRef<MultiTrackBackgroundMusic | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.3);
  const [currentTrack, setCurrentTrack] = useState(0);

  useEffect(() => {
    const music = new MultiTrackBackgroundMusic();
    music.setOnTrackChange((index) => setCurrentTrack(index));
    musicRef.current = music;
    
    return () => {
      music.destroy();
      musicRef.current = null;
    };
  }, []);

  useEffect(() => {
    musicRef.current?.setVolume(volume);
  }, [volume]);

  const togglePlay = useCallback(() => {
    const music = musicRef.current;
    if (!music) return;

    if (isPlaying) {
      music.stop();
      setIsPlaying(false);
    } else {
      music.start();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const nextTrack = useCallback(() => {
    musicRef.current?.skipToNext();
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    setVolumeState(Math.max(0, Math.min(1, newVolume)));
  }, []);

  return {
    isPlaying,
    volume,
    currentTrack,
    togglePlay,
    setVolume,
    nextTrack,
  };
}

export const TRACK_NAMES = MUSIC_PATTERNS.map(p => p.name);
