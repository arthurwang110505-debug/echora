import { useEffect, useMemo, useRef, useState } from 'react';
import type { LyricLine } from '@echora/core';

/**
 * SyncedLyric — the landing's lyric stage, driven by a real clock.
 *
 * Unlike KaraokeLine (fixed cadence), this reads `getTime()` every frame and
 * lights each word at its real timestamp from the demo transcript, exactly as
 * /player does. Line changes go through React (a few times a minute); word
 * fills are direct class toggles so nothing re-renders at 60fps.
 */

export interface SyncedLyricProps {
  lines: LyricLine[];
  /** Seconds into the track. Read every animation frame. */
  getTime: () => number;
  accent?: string;
  className?: string;
  onLineChange?: (index: number, line: LyricLine) => void;
  /** Show the upcoming line dimmed beneath the active one. */
  showNext?: boolean;
}

const findLineIndex = (lines: LyricLine[], time: number) => {
  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].time <= time) index = i;
    else break;
  }
  return index;
};

export default function SyncedLyric({ lines, getTime, accent = 'rgba(98, 245, 196, 0.6)', className = '', onLineChange, showNext = true }: SyncedLyricProps) {
  const [lineIndex, setLineIndex] = useState(() => Math.max(0, findLineIndex(lines, 0)));
  const lineRef = useRef<HTMLParagraphElement>(null);
  const onLineChangeRef = useRef(onLineChange);
  onLineChangeRef.current = onLineChange;

  const line = lines[lineIndex];
  const nextLine = lines[lineIndex + 1];
  const words = useMemo(() => {
    if (!line) return [] as Array<{ text: string; time: number; end: number; space: boolean }>;
    const source = line.words && line.words.length > 0 ? line.words : [{ time: line.time, text: line.text, end: nextLine?.time ?? line.time + 4 }];
    const lineEnd = nextLine?.time ?? (source[source.length - 1].end ?? line.time + 4);
    return source.map((word, index) => ({
      text: word.text,
      time: word.time,
      end: word.end ?? source[index + 1]?.time ?? lineEnd,
      // Latin words need their inter-word spacing back; CJK graphemes don't.
      space: index < source.length - 1 && /[A-Za-z0-9'’,.!?;:]$/u.test(word.text),
    }));
  }, [line, nextLine]);

  useEffect(() => {
    if (line) onLineChangeRef.current?.(lineIndex, line);
  }, [lineIndex, line]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let frame = 0;
    let lastIndex = lineIndex;
    const tick = () => {
      const time = getTime();
      const index = Math.max(0, findLineIndex(lines, time));
      if (index !== lastIndex) {
        lastIndex = index;
        setLineIndex(index);
      } else {
        const root = lineRef.current;
        if (root) {
          const spans = root.children;
          for (let i = 0; i < spans.length; i += 1) {
            const span = spans[i] as HTMLElement;
            const start = Number(span.dataset.start);
            const end = Number(span.dataset.end);
            const filled = time >= start;
            if (span.classList.contains('is-filled') !== filled) span.classList.toggle('is-filled', filled);
            // Live word gets a small "sung" lift; scale the fill with intra-word progress.
            const progress = filled ? Math.min(1, (time - start) / Math.max(0.08, end - start)) : 0;
            const fill = span.firstElementChild?.nextElementSibling as HTMLElement | null;
            if (fill) fill.style.clipPath = `inset(-12% ${((1 - progress) * 100).toFixed(1)}% -18% -2%)`;
          }
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [getTime, lines, lineIndex]);

  if (!line) return null;

  return (
    <div className={`synced-lyric ${className}`} aria-hidden="true">
      <p
        key={lineIndex}
        ref={lineRef}
        className="karaoke-line synced-lyric-line"
        style={{ ['--karaoke-accent' as string]: accent, ['--karaoke-word-ms' as string]: '0ms' }}
      >
        {words.map((word, index) => (
          <span key={`${lineIndex}-${index}`} className="karaoke-word synced-word" data-start={word.time} data-end={word.end}>
            <span className="karaoke-word-base">{word.text}{word.space ? '\u00A0' : ''}</span>
            <span className="karaoke-word-fill">{word.text}{word.space ? '\u00A0' : ''}</span>
          </span>
        ))}
      </p>
      {showNext && nextLine && (
        <p key={`next-${lineIndex}`} className="synced-lyric-next">{nextLine.text}</p>
      )}
    </div>
  );
}
