// src/original-folia-visualizers/island/LyricsIsland.tsx
//
// 靈動詞島 / Dynamic Lyrics Island.
//
// The reference is Lyricify's island (first shown 2022.09, CC BY-SA 4.0) and the iOS Dynamic
// Island it borrows from: one dark pill that hangs from the top of the screen, the line being sung
// in the middle, the artwork on the right, and a small glyph on the left that reads as the audio
// source. It is not a port - Lyricify is WPF - but the organising idea is theirs and is credited
// here and in the README.
//
// The pill is deliberately small and dark, so it reads as system chrome rather than as another
// player card: a wide rounded rectangle with a fully rounded cap, no visible border, and a
// near-black backdrop that lets the stage behind it stay the thing you are looking at.
//
// Text fills word by word by *clipping a lit copy over a dim one*. Both copies carry the same text
// and the pair is `aria-hidden`; the line is announced once from a polite live region, so a screen
// reader does not hear every word twice.
//
// Both placements need "the line, and how far into it we are" at 60 fps, so the moving parts are
// written straight to the DOM through refs and never through React state. Only the *line change*
// goes through React, because that is once per line and the text has to be laid out.

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
  /** `compact` is the pill in the player; `regular` is the visualizer mode, same pill, larger. */
  size?: LyricsIslandSize;
  /** Dim the pill on pause, like a media widget would. */
  paused?: boolean;
  /** Off hides the island entirely (no song, no lyrics). */
  visible?: boolean;
  /** Artwork for the right-hand cap. Optional: without it the pill is text-only. */
  coverUrl?: string | null;
  /** Artificial lag on the wipe, in seconds: positive shows lyrics later. */
  offsetSeconds?: number;
  onSeekLine?: (timeSec: number) => void;
  tuning?: IslandTuning;
  className?: string;
}

/** How many milliseconds the line change takes to cross over. */
const CROSSFADE_MS = 260;

interface SizeStyle {
  padY: number;
  padLeft: number;
  padRight: number;
  glyph: number;
  artwork: number;
  gap: number;
  title: string;
  translation: string;
  radius: number;
  maxWidth: string;
  shadow: string;
}

const SIZE_STYLES: Record<LyricsIslandSize, SizeStyle> = {
  compact: {
    padY: 11,
    padLeft: 16,
    padRight: 11,
    glyph: 22,
    artwork: 34,
    gap: 12,
    title: 'clamp(0.82rem, 2.8vw, 1.02rem)',
    translation: 'clamp(0.66rem, 2.1vw, 0.79rem)',
    // A pill: the cap radius is half the height, so it must not be a fixed number that a larger
    // font would break. `999px` clamps itself and stays a true capsule at every size.
    radius: 999,
    maxWidth: 'min(92vw, 34rem)',
    shadow: '0 10px 34px rgba(0,0,0,0.55)',
  },
  regular: {
    padY: 20,
    padLeft: 28,
    padRight: 20,
    glyph: 40,
    artwork: 62,
    gap: 22,
    title: 'clamp(1.45rem, 4.8vw, 2.9rem)',
    translation: 'clamp(0.9rem, 2.4vw, 1.3rem)',
    radius: 999,
    maxWidth: 'min(86vw, 52rem)',
    shadow: '0 26px 80px rgba(0,0,0,0.6)',
  },
};

/**
 * The audio-source glyph: five rounded bars that rise and fall like a level meter.
 *
 * It is decorative, so it animates on its own clock rather than reacting to real audio - the island
 * can be on screen with no analyser attached (a remote YouTube player, a paused tab), and a glyph
 * that froze in those cases would read as "not playing" while the song is clearly playing.
 *
 * Driven by rAF and written straight to the rects, like the word wipe: this runs at 60 fps inside a
 * component that must not re-render.
 */
const WaveGlyph: React.FC<{ size: number; color: string; playing: boolean }> = ({ size, color, playing }) => {
  const barRefs = useRef<Array<SVGRectElement | null>>([]);
  // The loop runs for the component's whole life and reads `playing` through a ref, so pausing does
  // not tear the effect down and restart it. Keying the effect on `playing` would also mean a host
  // that calls rAF synchronously (the specs do) restarts the loop before the previous cleanup has
  // run, which recurses.
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const rects = barRefs.current;
    // Honour the OS setting: the bars hold their resting heights instead of pulsing.
    const reducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return undefined;

    // `alive` gates the loop rather than the frame number. A host that invokes rAF synchronously
    // (the test stub does, and a rAF polyfill can) would otherwise recurse until the stack dies;
    // a real browser never does, but the gate costs nothing and makes the effect safe to mount in
    // any environment, which is what the specs need.
    let frame = 0;
    let alive = true;
    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    const tick = (now: number) => {
      if (!alive) return;
      // A frozen meter is the correct still frame when the song is paused: skip the writes and
      // keep the frame loop idle-cheap.
      if (!playingRef.current) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const seconds = (now - started) / 1000;
      for (let index = 0; index < rects.length; index += 1) {
        const rect = rects[index];
        if (!rect) continue;
        // Each bar is a sine at a slightly different rate and phase, so the group never repeats
        // as one block; the envelope keeps the outer bars short.
        const centre = (rects.length - 1) / 2;
        const envelope = 1 - Math.abs(index - centre) / (centre + 1);
        const wave = 0.5 + 0.5 * Math.sin(seconds * (5.4 + index * 0.9) + index * 1.7);
        const height = 3 + envelope * 11 * (0.35 + wave * 0.65);
        rect.setAttribute('height', height.toFixed(2));
        rect.setAttribute('y', (12 - height / 2).toFixed(2));
      }
      if (alive) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, []);

  const bars = 5;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      {Array.from({ length: bars }, (_, index) => {
        // Symmetric envelope: tall in the middle, short at the edges, like a level meter.
        const centre = (bars - 1) / 2;
        const envelope = 1 - Math.abs(index - centre) / (centre + 1);
        const height = 3 + envelope * 11 * 0.6;
        const x = 3 + index * 3.9;
        return (
          <rect
            key={index}
            ref={element => { barRefs.current[index] = element; }}
            x={x}
            y={12 - height / 2}
            width="2.4"
            height={height}
            rx="1.2"
            fill={color}
            style={{ opacity: 0.55 + envelope * 0.45 }}
          />
        );
      })}
    </svg>
  );
};

export const LyricsIsland: React.FC<LyricsIslandProps> = ({
  currentTime,
  currentLineIndex,
  lines,
  theme,
  size = 'compact',
  paused = false,
  visible = true,
  coverUrl = null,
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
  // clock happens to tick.
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

      const progress = clampUnit(lineProgress(active, time));
      if (ringRef.current) {
        // The ring is the pill's own progress: a hairline that wraps the left glyph, so the pill
        // still reads as "playing" during a long instrumental line.
        const circumference = 2 * Math.PI * 15.5;
        ringRef.current.style.strokeDasharray = `${circumference * progress} ${circumference}`;
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

  // The pill's own surface. Near-black regardless of theme: it is system chrome, and a theme
  // background would tint it into a card. A hint of the theme's accent is kept in the border so it
  // still belongs to the stage.
  const surface = {
    paddingTop: style.padY,
    paddingBottom: style.padY,
    paddingLeft: style.padLeft,
    paddingRight: style.padRight,
    borderRadius: style.radius,
    maxWidth: style.maxWidth,
    background: 'linear-gradient(180deg, rgba(8,10,16,0.97), rgba(8,10,16,0.92))',
    border: `1px solid ${theme.primaryColor}1f`,
    boxShadow: style.shadow,
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    fontFamily,
    color: theme.primaryColor,
  } as const;

  // No line to draw. The component used to return null here, which in the visualizer mode left an
  // empty stage: pick Island, see nothing, conclude the feature is broken. Saying why costs one
  // small pill and turns a silent failure into a readable state.
  if (!line) {
    return (
      <div className={`pointer-events-none select-none ${className}`} style={surface}>
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
  // reading `textContent`, including tests - see every word twice. So the wrapper is `aria-hidden`
  // and the line is announced once, from the live region below.
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
            style={{ color: theme.primaryColor, clipPath: 'inset(0 100% 0 0)' }}
          >
            {word.text}
          </span>
        </span>
      ))
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: isPlaying ? 1 : 0.72, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.96 }}
      transition={{ duration: CROSSFADE_MS / 1000, ease: [0.22, 0.61, 0.36, 1] }}
      className={`pointer-events-auto select-none ${onSeekLine ? 'cursor-pointer' : ''} ${className}`}
      style={surface}
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
        {/* Left: the audio-source glyph, wrapped in the line's progress ring. */}
        <span className="relative shrink-0" style={{ width: style.glyph, height: style.glyph }} aria-hidden="true">
          <svg
            viewBox="0 0 36 36"
            className="absolute inset-0 h-full w-full -rotate-90"
            aria-hidden="true"
          >
            <circle
              ref={ringRef}
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke={theme.accentColor}
              strokeWidth="2"
              strokeLinecap="round"
              style={{ strokeDasharray: '0 97.4', opacity: 0.9 }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center">
            <WaveGlyph size={style.glyph * 0.62} color={theme.accentColor} playing={isPlaying} />
          </span>
        </span>

        {/* Middle: the line, then its translation. Both truncate rather than wrap, so the pill
            keeps one height for the whole song and does not jump. */}
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
                opacity: 0.5,
              }}
            >
              {line.translation}
            </div>
          ) : null}
        </div>

        {/* Right: artwork, rounded like the pill's own cap. */}
        {coverUrl ? (
          <span
            className="relative shrink-0 overflow-hidden"
            style={{
              width: style.artwork,
              height: style.artwork,
              borderRadius: Math.round(style.artwork * 0.3),
              background: `${theme.primaryColor}14`,
            }}
          >
            <img
              src={coverUrl}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </span>
        ) : null}
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
