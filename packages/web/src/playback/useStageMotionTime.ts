// src/playback/useStageMotionTime.ts
//
// A `MotionValue<number>` fed by the player's stage clock.
//
// The visualizer modes receive their clock through `OriginalFoliaVisualizerStage`, which owns the
// requestAnimationFrame loop, the audio bands and the MotionValues. The persistent 靈動詞島 overlay
// sits outside that subtree, so it needs the same time as a MotionValue without standing up a
// second stage.
//
// Deliberately *not* routed through React state: at 60 fps that would re-render the whole player
// page. The MotionValue is written in a frame loop and read by the island's own `on('change')`
// subscription, so only the island's DOM nodes update.

import { useEffect, useRef } from 'react';
import { useMotionValue, type MotionValue } from 'framer-motion';

interface UseStageMotionTimeOptions {
  /** The same provider the stage uses; `null` means "no opinion, use the fallback". */
  provider: () => number | null;
  /** Position to show while nothing is playing (progress text, scrubbing). */
  fallbackSeconds: number;
  /** Whether to run the loop at all. */
  isPlaying: boolean;
}

export const useStageMotionTime = ({
  provider,
  fallbackSeconds,
  isPlaying,
}: UseStageMotionTimeOptions): MotionValue<number> => {
  const value = useMotionValue(fallbackSeconds);
  const providerRef = useRef(provider);
  const fallbackRef = useRef(fallbackSeconds);
  providerRef.current = provider;
  fallbackRef.current = fallbackSeconds;

  // Paused (or scrubbing): the loop is not running, so at least keep the value honest. This is a
  // plain assignment - the consumer sees one update per prop change, not a frame loop.
  useEffect(() => {
    if (isPlaying) return;
    const reading = providerRef.current();
    value.set(reading === null ? fallbackRef.current : reading);
  }, [value, isPlaying, fallbackSeconds]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    let frame = 0;
    const tick = () => {
      const reading = providerRef.current();
      value.set(reading === null ? fallbackRef.current : reading);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [value, isPlaying]);

  return value;
};
