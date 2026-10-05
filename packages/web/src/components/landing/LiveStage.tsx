import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Line, ThemeConfig } from '@echora/core';
import type { LandingAudioEngine } from './landingAudio';

/**
 * LiveStage — the player's real visualizer stage (`OriginalFoliaVisualizerStage`,
 * the same component /player renders) running inside the landing's Modes act.
 *
 * It is heavy (Pixi / Three scenes per mode), so it only mounts once the act
 * is about to scroll into view, and it is fed by the landing audio engine's
 * clock at a modest 10 Hz — the stage interpolates between frames itself.
 */

const OriginalFoliaVisualizerStage = lazy(() => import('../OriginalFoliaVisualizerStage'));

export interface LiveStageProps {
  mode: string;
  theme: ThemeConfig;
  lines: Line[];
  engine: LandingAudioEngine;
  coverUrl?: string;
  songTitle?: string;
  songArtist?: string;
  className?: string;
}

const findLineIndex = (lines: Line[], timeMs: number) => {
  let index = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startTime <= timeMs) index = i;
    else break;
  }
  return index;
};

export default function LiveStage({ mode, theme, lines, engine, coverUrl, songTitle, songArtist, className = '' }: LiveStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [time, setTime] = useState(0);
  const [bands, setBands] = useState({ bass: 0, lowMid: 0, mid: 0, vocal: 0, treble: 0 });

  // Mount the real stage only when the Modes act is one viewport away.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof window === 'undefined') return;
    if (typeof IntersectionObserver === 'undefined') {
      setArmed(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setArmed(true);
        observer.disconnect();
      }
    }, { rootMargin: '100% 0px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Feed the stage the landing clock + energy (10 Hz is plenty; it eases internally).
  useEffect(() => {
    if (!armed || typeof window === 'undefined') return;
    const interval = window.setInterval(() => {
      setTime(engine.getTime());
      const energy = engine.getEnergy();
      setBands({ bass: energy, lowMid: energy * 0.8, mid: energy * 0.6, vocal: energy * 0.5, treble: energy * 0.4 });
    }, 100);
    return () => window.clearInterval(interval);
  }, [armed, engine]);

  const activeLineIndex = findLineIndex(lines, time * 1000);

  return (
    <div ref={hostRef} className={`relative h-full w-full ${className}`} data-live-stage={armed ? 'armed' : 'idle'}>
      {armed && (
        <Suspense fallback={null}>
          <OriginalFoliaVisualizerStage
            lines={lines}
            activeLineIndex={activeLineIndex}
            displayedTime={time}
            isPlaying
            theme={theme}
            visualizerMode={mode}
            coverUrl={coverUrl}
            songTitle={songTitle}
            songArtist={songArtist}
            onSeekLine={() => undefined}
            audioBands={bands}
            backgroundMode="latent"
            isPlayerChromeHidden
          />
        </Suspense>
      )}
    </div>
  );
}
