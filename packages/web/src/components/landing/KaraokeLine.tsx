import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * KaraokeLine — an auto-cycling word-fill lyric preview. Each line fills
 * word-by-word (clip-path sweep, staggered per grapheme) like Echora's
 * karaoke lyric stage, holds, then crossfades to the next line.
 *
 * Decorative by default (aria-hidden) — it is a motion preview, not content.
 */

export interface KaraokeLineProps {
  lines: string[];
  /** Hold time after a line finishes filling, before the next one starts. */
  holdMs?: number;
  /** Duration of a single word's fill. */
  wordMs?: number;
  /** Overlap factor between consecutive words (0..1). */
  stagger?: number;
  /** Glow color for filled words. */
  accent?: string;
  className?: string;
  /** Called when the active line changes (to sync scene colors / mode chips). */
  onLineChange?: (index: number) => void;
}

export default function KaraokeLine({
  lines,
  holdMs = 2100,
  wordMs = 430,
  stagger = 0.55,
  accent = 'rgba(98, 245, 196, 0.6)',
  className = '',
  onLineChange,
}: KaraokeLineProps) {
  const [lineIndex, setLineIndex] = useState(0);
  const [filled, setFilled] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const chars = useMemo(() => Array.from(lines[lineIndex % lines.length] ?? ''), [lines, lineIndex]);

  useEffect(() => {
    onLineChange?.(lineIndex % lines.length);
  }, [lineIndex, lines.length, onLineChange]);

  useEffect(() => {
    if (prefersReducedMotion) {
      // Reduced motion: show the current line statically filled, no cycling.
      setFilled(true);
      return;
    }
    setFilled(false);
    // Double rAF so the freshly mounted line is painted unfilled first.
    let fillTimer = 0;
    const startFill = window.setTimeout(() => {
      setFilled(true);
      const totalFill = chars.length * wordMs * stagger + wordMs;
      fillTimer = window.setTimeout(() => {
        setLineIndex(index => (index + 1) % lines.length);
      }, totalFill + holdMs);
    }, 120);
    return () => {
      window.clearTimeout(startFill);
      window.clearTimeout(fillTimer);
    };
  }, [chars.length, holdMs, lines.length, prefersReducedMotion, stagger, wordMs]);

  return (
    <p
      key={lineIndex}
      aria-hidden="true"
      className={`karaoke-line ${className}`}
      style={{ ['--karaoke-accent' as string]: accent, ['--karaoke-word-ms' as string]: `${wordMs}ms` }}
    >
      {chars.map((char, index) => {
        const delay = index * wordMs * stagger;
        const isSpace = char.trim() === '';
        return (
          <span
            key={`${index}-${char}`}
            className={`karaoke-word${filled ? ' is-filled' : ''}`}
            style={{ transitionDelay: prefersReducedMotion ? undefined : `${delay}ms` }}
          >
            <span className="karaoke-word-base">{isSpace ? '\u00A0' : char}</span>
            <span className="karaoke-word-fill" aria-hidden="true">{char}</span>
          </span>
        );
      })}
    </p>
  );
}
