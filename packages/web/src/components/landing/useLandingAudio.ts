import { useEffect, useMemo, useState } from 'react';
import { LandingAudioEngine, type LandingAudioSnapshot } from './landingAudio';

/**
 * useLandingAudio — owns one LandingAudioEngine for the landing's lifetime and
 * mirrors its status into React state. The engine itself (time, energy) is read
 * imperatively inside rAF loops to avoid re-rendering on every frame.
 */
export function useLandingAudio(src: string, durationMs: number) {
  const engine = useMemo(() => new LandingAudioEngine(src, durationMs), [src, durationMs]);
  const [snapshot, setSnapshot] = useState<LandingAudioSnapshot>(() => engine.getSnapshot());

  useEffect(() => {
    const unsubscribe = engine.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      engine.dispose();
    };
  }, [engine]);

  return { engine, ...snapshot };
}
