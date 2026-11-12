// src/original-folia-visualizers/island/LyricsIsland.tsx
//
// 靈動詞島 / Dynamic Lyrics Island.
//
// The reference for this shape is Lyricify's island (first shown 2022.09, CC BY-SA 4.0): a small
// rounded readout that carries one lyric line, its translation, and a ring that fills as the line
// plays. It is not a port of their code - the original is WPF - but the organising idea is theirs
// and is credited here and in the README.
//
// Echora uses it in two places that want the same thing from different directions:
//
//   * as a visualizer mode, where the stage has nothing else to show, and
//   * as a corner overlay in the player, where the stage is showing something else entirely.
//
// Both need "the line, and how far into it we are", at 60 fps, without re-rendering React. So the
// component subscribes to the `currentTime` MotionValue with `on('change')` and writes the moving
// parts - the clip offsets, the ring - straight to the DOM through refs. Line *changes* do go
// through React state, because that is a once-per-line event and the text has to be laid out.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, type MotionValue } from 'framer-motion';
import type { IslandTuning, Theme } from '../../types';
import { DEFAULT_ISLAND_TUNING } from '../../types';
import i18n from '../../i18n';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../../utils/fontStacks';
import {
  clampUnit,
  lineProgress,
  resolveIslandLine,
  shouldShowIsland,
  wordFill,
  type IslandLine,
} from './islandModel';

export type LyricsIslandSize = 'compact' | 'regular';

export interface LyricsIslandProps {
  /** The clock the stage is drawing against - already offset-corrected. */
  currentTime: MotionValue<number>;
  /** Authoritative active line, or -1. Resolved again inside for the boundary case. */
  currentLineIndex: number;
  lines: IslandLine[];
  theme: Theme;
  /** `compact` is the corner overlay; `regular` is the visualizer mode. */
  size?: LyricsIslandSize;
  /** Crossfade out on pause, like a media widget would. */
  paused?: boolean;
  /** Off hides the island entirely (no song, no lyrics). */
  visible?: boolean;
  /** Artificial lag on the wipe, in seconds: positive shows lyrics later. */
  offsetSeconds?: number;
  onSeekLine?: (timeSec: number) => void;
  tuning?: IslandTuning;
  className?: string;
}

/** How many milliseconds the line change takes to cross over. */
const CROSSFADE_MS = 260;

const SIZE_STYLES: Record<LyricsIslandSize, {
  padX: number;
  padY: number;
  ring: number;
  gap: number;
  title: string;
  translation: string;
  radius: number;
  maxWidth: string;
  shadow: string;
}> = {
  compact: {
    padX: 14,
    padY: 9,
    ring: 18,
    gap: 10,
    title: 'clamp(0.78rem, 2.6vw, 1.02rem)',
    translation: 'clamp(0.63rem, 2vw, 0.8rem)',
    radius: 18,
    maxWidth: 'min(88vw, 30rem)',
    shadow: '0 8px 28px rgba(0,0,0,0.42)',
  },
  regular: {
    padX: 26,
    padY: 18,
    ring: 34,
    gap: 18,
    title: 'clamp(1.35rem, 4.4vw, 2.6rem)',
    translation: 'clamp(0.8rem, 2.1vw, 1.15rem)',
    radius: 30,
    maxWidth: 'min(78vw, 46rem)',
    shadow: '0 22px 70px rgba(0,0,0,0.5)',
  },
};

const RING_CIRCUMFERENCE = 2 * Math.PI * 15.5;

export const LyricsIsland: React.FC<LyricsIslandProps> = ({
  currentTime,
  currentLineIndex,
  lines,
  theme,
  size = 'compact',
  paused = false,
  visible = true,
  offsetSeconds = 0,
  onSeekLine,
  tuning = DEFAULT_ISLAND_TUNING,
  className = '',
}) => {
  const style = SIZE_STYLES[size];

  const [line, setLine] = useState<IslandLine | null>(null);
  const [isPlaying, setIsPlaying] = useState(!paused);

  // Everything the per-frame writer touches. These are DOM nodes, not React children, so moving the
  // playhead never re-renders anything.
  const wordFillRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const progressRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const ringRef = useRef<SVGCircleElement | null>(null);
  const lineRef = useRef<IslandLine | null>(null);
  const offsetRef = useRef(offsetSeconds);
  lineRef.current = line;
  offsetRef.current = offsetSeconds;

  const lineStart = line?.startTime ?? 0;
  const wordCount = line?.words.length ?? 0;
  // Reset the fill targets when the line changes so a stale fraction from the previous line cannot
  // linger on a word that has not started yet.
  wordFillRefs.current.length = wordCount;
  progressRefs.current.length = wordCount;

  // The line is React state: it changes a few dozen times a song, and its text has to be measured
  // and laid out. Resolving it from the same function the tests use keeps the boundary behaviour in
  // one place instead of duplicating "what if currentLineIndex is -1" in the render.
  useEffect(() => {
    if (!shouldShowIsland(lines, visible)) {
      setLine(null);
      return;
    }
    const next = resolveIslandLine(lines, currentLineIndex, currentTime.get() + offsetSeconds);
    setLine(previous => (previous?.startTime === next?.startTime && previous?.fullText === next?.fullText ? previous : next));
  }, [lines, currentLineIndex, visible, currentTime, offsetSeconds]);

  useEffect(() => {
    setIsPlaying(!paused);
  }, [paused]);

  // The 60 fps writer. Reads the clock, never writes React state.
  //
  // Keyed on `line` as well as `currentTime`: the wipe targets are the *elements of the current
  // line*, so when the line changes there are new nodes to fill that did not exist when this effect
  // last ran. Without it the first frame of every new line would sit at the initial clip until the
  // clock happens to tick - a full-length line would show its words unlit for up to a second.
  useEffect(() => {
    const paint = (raw: number) => {
      const time = raw + offsetRef.current;
      const active = lineRef.current;
      if (!active) return;

      const fills = wordFill(active, time);
      for (let i = 0; i < fills.length; i += 1) {
        const element = wordFillRefs.current[i];
        if (element) {
          // A horizontal clip on a duplicated, lit copy of the word: cheap, composited, and it
          // reads as the word being sung rather than as a bar next to it.
          element.style.clipPath = `inset(0 ${(1 - clampUnit(fills[i])) * 100}% 0 0)`;
        }
      }

      if (ringRef.current) {
        const dash = RING_CIRCUMFERENCE * lineProgress(active, time);
        ringRef.current.style.strokeDasharray = `${dash} ${RING_CIRCUMFERENCE}`;
      }
    };

    paint(currentTime.get());
    const unsubscribe = currentTime.on('change', paint);
    return unsubscribe;
  }, [currentTime, line]);

  const fontFamily = resolveThemeFontStack(theme);
  const fontWeight = resolveThemeFontWeight(theme, 600);
  const translationFontWeight = resolveThemeFontWeight(theme, 400);

  const words = useMemo(() => line?.words ?? [], [line]);
  const hasWordTiming = words.length > 0;

  if (!visible) return null;

  // No line to draw. The component used to return null here, which in the visualizer mode left an
  // empty stage: pick Island, see nothing, conclude the feature is broken. Saying why costs one
  // small card and turns a silent failure into a readable state.
  if (!line) {
    return (
      <div
        className={`pointer-events-none select-none ${className ?? ''}`}
        style={{
          padding: `${style.padY}px ${style.padX}px`,
          borderRadius: style.radius,
          maxWidth: style.maxWidth,
          background: `linear-gradient(135deg, ${theme.backgroundColor}f2, ${theme.backgroundColor}dd)`,
          border: `1px dashed ${theme.primaryColor}33`,
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          fontFamily,
          color: theme.primaryColor,
        }}
      >
        <p
          className="whitespace-pre-line text-center leading-relaxed"
          style={{ fontSize: style.translation, opacity: 0.72 }}
        >
          {i18n.t('ui.islandEmpty')}
        </p>
      </div>
    );
  }

  // Each word is drawn twice: a dim copy that is always fully visible, and a lit copy clipped to the
  // fraction sung so far. Both carry the same text, which would make a screen reader - and anything
  // reading `textContent`, including tests - see every word twice ("我是我是"). So the wrapper is
  // `aria-hidden` and the line is announced once, from the live region below. That also keeps the
  // wipe out of the accessibility tree, where it describes nothing useful.
  const wordElements = hasWordTiming
    ? words.map((word, index) => (
        <span
          key={`${index}-${word.text}`}
          aria-hidden="true"
          className="relative inline-block whitespace-pre"
        >
          {/* Always fully drawn, so the line's silhouette does not change width as the wipe passes. */}
          <span style={{ opacity: tuning.upcomingWordOpacity }}>{word.text}</span>
          <span
            ref={element => { wordFillRefs.current[index] = element; }}
            className="absolute inset-0 whitespace-pre"
            style={{ color: theme.accentColor, clipPath: 'inset(0 100% 0 0)' }}
          >
            {word.text}
          </span>
        </span>
      ))
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: isPlaying ? 1 : 0.62, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: CROSSFADE_MS / 1000, ease: [0.22, 0.61, 0.36, 1] }}
      className={`pointer-events-auto select-none ${onSeekLine ? 'cursor-pointer' : ''} ${className}`}
      style={{
        padding: `${style.padY}px ${style.padX}px`,
        borderRadius: style.radius,
        maxWidth: style.maxWidth,
        background: `linear-gradient(135deg, ${theme.backgroundColor}f2, ${theme.backgroundColor}dd)`,
        border: `1px solid ${theme.primaryColor}26`,
        boxShadow: style.shadow,
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        fontFamily,
        color: theme.primaryColor,
      }}
      onClick={() => onSeekLine?.(lineStart)}
      role={onSeekLine ? 'button' : undefined}
      tabIndex={onSeekLine ? 0 : undefined}
      onKeyDown={event => {
        if (!onSeekLine) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSeekLine(lineStart);
        }
      }}
    >
      <div className="flex items-center" style={{ gap: style.gap }}>
        {/* The ring is the line's own progress. It is the only always-moving element, which is
            what keeps the island legible as "playing" even when a line is long and slow. */}
        <svg
          width={style.ring}
          height={style.ring}
          viewBox="0 0 36 36"
          className="shrink-0 -rotate-90"
          aria-hidden="true"
        >
          <circle cx="18" cy="18" r="15.5" fill="none" stroke={`${theme.primaryColor}2b`} strokeWidth="2.5" />
          <circle
            ref={ringRef}
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke={theme.accentColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ strokeDasharray: `0 ${RING_CIRCUMFERENCE}` }}
          />
        </svg>

        <div className="min-w-0 flex-1">
          <div
            className="truncate leading-tight"
            style={{
              fontSize: `calc(${style.title} * ${tuning.lineSize})`,
              fontWeight,
              color: theme.primaryColor,
              letterSpacing: '-0.01em',
            }}
          >
            {wordElements ?? line.fullText}
          </div>
          {tuning.showTranslation && line.translation ? (
            <div
              className="truncate mt-0.5"
              style={{
                fontSize: style.translation,
                fontWeight: translationFontWeight,
                color: theme.primaryColor,
                opacity: 0.58,
              }}
            >
              {line.translation}
            </div>
          ) : null}
        </div>
      </div>

      {/* Screen readers get the current line as a polite live region rather than the wipe. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {line.fullText}
        {line.translation ? `，${line.translation}` : ''}
      </span>
    </motion.div>
  );
};

export default LyricsIsland;
