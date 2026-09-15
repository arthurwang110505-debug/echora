import React, { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { type Line, type Word, type ThemeConfig } from '@echora/core';

interface FoliaLyricStageProps {
  lines: Line[];
  activeLineIndex: number;
  displayedTime: number;
  isPlaying?: boolean;
  theme: ThemeConfig;
  visualizerMode?: string;
  onSeekLine: (timeSec: number) => void;
}

// Pseudo-random deterministic hash for organic word rotation and float
function hashString(str: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export const FoliaLyricStage: React.FC<FoliaLyricStageProps> = ({
  lines,
  activeLineIndex,
  displayedTime,
  isPlaying: _isPlaying = false,
  theme,
  visualizerMode = 'classic',
  onSeekLine,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // Smooth scroll to active line
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLineIndex]);

  // Visualizer-specific styling configurations
  const visualizerStyle = useMemo(() => {
    switch (visualizerMode) {
      case 'sonnet':
        return {
          perspective: 1200,
          activeScale: 1.06,
          letterSpacing: '0.05em',
          wordGlow: '0 0 25px rgba(98, 245, 196, 0.8)',
        };
      case 'tilt':
        return {
          perspective: 800,
          activeScale: 1.08,
          letterSpacing: '0.02em',
          wordGlow: '0 0 30px rgba(98, 245, 196, 0.9), 0 0 60px rgba(98, 245, 196, 0.4)',
        };
      case 'fume':
        return {
          perspective: 1000,
          activeScale: 1.04,
          letterSpacing: '0.03em',
          wordGlow: '0 0 35px rgba(98, 245, 196, 0.75), 0 0 70px rgba(98, 245, 196, 0.3)',
        };
      case 'classic':
      default:
        return {
          perspective: 1000,
          activeScale: 1.05,
          letterSpacing: '0.02em',
          wordGlow: '0 0 20px rgba(98, 245, 196, 0.8), 0 0 45px rgba(98, 245, 196, 0.4)',
        };
    }
  }, [visualizerMode]);

  return (
    <div
      ref={containerRef}
      className="relative w-full flex-1 overflow-y-auto scrollbar-none flex flex-col items-center justify-start py-28 px-4 sm:px-8 select-none"
      style={{ perspective: visualizerStyle.perspective }}
    >
      <div className="w-full max-w-4xl flex flex-col items-center space-y-6 sm:space-y-8 md:space-y-10 my-auto text-center">
        {lines.map((line, idx) => {
          const isActive = idx === activeLineIndex;
          const distance = idx - activeLineIndex;
          const absDistance = Math.abs(distance);

          // Only render visible surrounding lines for maximum performance
          if (absDistance > 6) return null;

          if (isActive) {
            return (
              <motion.div
                key={`active-${idx}`}
                ref={activeLineRef}
                layout
                initial={{ opacity: 0.3, y: 14, scale: 0.96, filter: 'blur(6px)' }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: visualizerStyle.activeScale,
                  filter: 'blur(0px)',
                  rotateX: visualizerMode === 'tilt' ? -4 : 0,
                }}
                transition={{
                  type: 'spring',
                  stiffness: 280,
                  damping: 26,
                }}
                onClick={() => onSeekLine(line.startTime / 1000)}
                className="cursor-pointer z-20 py-2 px-4 transition-colors"
                style={{
                  letterSpacing: visualizerStyle.letterSpacing,
                  transformStyle: 'preserve-3d',
                }}
              >
                {line.words && line.words.length > 0 ? (
                  <div className="inline-flex flex-wrap items-center justify-center gap-x-2.5 sm:gap-x-3.5 gap-y-2 text-2xl sm:text-4xl md:text-5xl font-heading font-black tracking-tight leading-tight">
                    {line.words.map((word: Word, wIdx: number) => {
                      const wordStartSec = word.startTime / 1000;
                      const wordEndSec = word.endTime / 1000;
                      const isCurrentWord = displayedTime >= wordStartSec && displayedTime <= wordEndSec;
                      const isPastWord = displayedTime > wordEndSec;

                      // Folia's organic word rotation & float calculation
                      const wordSeed = hashString(word.text, wIdx + idx * 100);
                      const organicRotation = visualizerMode === 'classic'
                        ? ((wordSeed % 11) - 5) * 0.6
                        : 0;

                      return (
                        <motion.span
                          key={wIdx}
                          initial={false}
                          animate={
                            isCurrentWord
                              ? {
                                  scale: 1.12,
                                  rotate: organicRotation * 1.5,
                                  y: -3,
                                }
                              : isPastWord
                              ? {
                                  scale: 1.0,
                                  rotate: organicRotation * 0.5,
                                  y: 0,
                                }
                              : {
                                  scale: 0.96,
                                  rotate: organicRotation,
                                  y: 1,
                                }
                          }
                          transition={{
                            type: 'spring',
                            stiffness: 350,
                            damping: 24,
                          }}
                          className="inline-block transition-colors duration-150"
                          style={{
                            color: isCurrentWord
                              ? theme.accentColor || '#62f5c4'
                              : isPastWord
                              ? '#ffffff'
                              : 'rgba(255, 255, 255, 0.35)',
                            textShadow: isCurrentWord ? visualizerStyle.wordGlow : 'none',
                          }}
                        >
                          {word.text}
                        </motion.span>
                      );
                    })}
                  </div>
                ) : (
                  <h2
                    className="text-2xl sm:text-4xl md:text-5xl font-heading font-black tracking-tight leading-tight"
                    style={{
                      color: theme.accentColor || '#62f5c4',
                      textShadow: visualizerStyle.wordGlow,
                    }}
                  >
                    {line.fullText}
                  </h2>
                )}
              </motion.div>
            );
          }

          // Inactive surrounding lines with smooth contextual fade & blur
          const opacity = absDistance === 1 ? 0.38 : absDistance === 2 ? 0.20 : 0.08;
          const blur = absDistance === 1 ? 1 : absDistance === 2 ? 2.5 : 4.5;
          const scale = Math.max(0.78, 1 - absDistance * 0.06);
          const yShift = distance * (absDistance === 1 ? 4 : 2);

          return (
            <motion.div
              key={`line-${idx}`}
              layout
              initial={{ opacity: 0 }}
              animate={{
                opacity,
                scale,
                y: yShift,
                filter: `blur(${blur}px)`,
              }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              onClick={() => onSeekLine(line.startTime / 1000)}
              className="cursor-pointer font-heading font-semibold text-slate-300 hover:opacity-70 hover:text-white transition-opacity select-none text-base sm:text-xl md:text-2xl px-3 py-1"
            >
              {line.fullText}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
