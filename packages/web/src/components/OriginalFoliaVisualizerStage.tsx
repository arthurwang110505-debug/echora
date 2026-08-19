import { useEffect, useMemo } from 'react';
import { useMotionValue } from 'framer-motion';
import type { Line, ThemeConfig } from '@echora/core';
import OriginalVisualizerRenderer from './OriginalVisualizerRendererProxy';

type OriginalMode = 'classic' | 'cadenza' | 'partita' | 'fume' | 'monet' | 'cappella' | 'pendolo' | 'sonnet' | 'claddagh' | 'diorama' | 'tilt';

interface Props {
  lines: Line[];
  activeLineIndex: number;
  displayedTime: number;
  isPlaying?: boolean;
  theme: ThemeConfig;
  visualizerMode?: string;
  coverUrl?: string;
  songTitle?: string;
  songArtist?: string;
  onSeekLine: (timeSec: number) => void;
  audioBands?: { bass: number; lowMid: number; mid: number; vocal: number; treble: number };
  backgroundMode?: string;
  visualizerTunings?: Record<string, unknown>;
}

const MODES: OriginalMode[] = ['classic', 'cadenza', 'partita', 'fume', 'monet', 'cappella', 'pendolo', 'sonnet', 'claddagh', 'diorama', 'tilt'];

const toOriginalTheme = (theme: ThemeConfig) => ({
  name: theme.name,
  backgroundColor: theme.backgroundColor || '#07090e',
  primaryColor: theme.primaryColor || '#62f5c4',
  accentColor: theme.accentColor || '#62f5c4',
  secondaryColor: theme.secondaryColor || '#6366f1',
  fontStyle: theme.fontStyle || 'sans',
  animationIntensity: 'normal' as const,
  fontWeight: 700,
});

export default function OriginalFoliaVisualizerStage({ lines, activeLineIndex, displayedTime, isPlaying = false, theme, visualizerMode = 'classic', coverUrl, songTitle, songArtist, onSeekLine, audioBands, backgroundMode = 'latent', visualizerTunings }: Props) {
  const currentTime = useMotionValue(displayedTime);
  const audioPower = useMotionValue(isPlaying ? 0.8 : 0.05);
  const mode = (MODES.includes(visualizerMode as OriginalMode) ? visualizerMode : 'classic') as OriginalMode;
  // Echora stores lyric timestamps in milliseconds; Folia's renderer contract
  // is seconds. Passing the values through unchanged makes every animation
  // enter/exit phase drift by 1000x.
  const originalLines = useMemo(() => lines.map(line => ({
    ...line,
    startTime: line.startTime / 1000,
    endTime: line.endTime / 1000,
    words: line.words.map(word => ({
      ...word,
      startTime: word.startTime / 1000,
      endTime: word.endTime / 1000,
      syllables: word.syllables?.map(syllable => ({ ...syllable, startTime: syllable.startTime / 1000, endTime: syllable.endTime / 1000 })),
    })),
  })), [lines]);
  const originalTheme = useMemo(() => toOriginalTheme(theme), [theme]);

  const bands = useMemo(() => audioBands ?? {
    // YouTube's iframe exposes transport time, but not PCM/FFT data. Keep a
    // deterministic musical pulse so the original visualizers still breathe
    // while a local audio source can provide real analyser bands later.
    bass: isPlaying ? 0.42 + Math.sin(displayedTime * 5.2) * 0.16 : 0.04,
    lowMid: isPlaying ? 0.34 + Math.sin(displayedTime * 3.1 + 1) * 0.12 : 0.03,
    mid: isPlaying ? 0.28 + Math.sin(displayedTime * 2.2 + 2) * 0.10 : 0.03,
    vocal: isPlaying ? 0.38 + Math.sin(displayedTime * 4.0 + 0.5) * 0.14 : 0.03,
    treble: isPlaying ? 0.24 + Math.sin(displayedTime * 7.0 + 2.5) * 0.10 : 0.02,
  }, [audioBands, displayedTime, isPlaying]);

  useEffect(() => {
    currentTime.set(displayedTime);
    audioPower.set(isPlaying ? 0.8 : 0.05);
  }, [audioPower, currentTime, displayedTime, isPlaying]);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <OriginalVisualizerRenderer
        mode={mode}
        currentTime={currentTime}
        currentLineIndex={activeLineIndex}
        lines={originalLines}
        theme={originalTheme}
        subtitleTheme={originalTheme}
        audioPower={audioPower}
        audioBands={bands}
        background={{ mode: backgroundMode as any }}
        visualizerTunings={visualizerTunings as any}
        showText
        songTitle={songTitle}
        songArtist={songArtist}
        coverUrl={coverUrl}
        paused={!isPlaying}
        onLyricLineSeek={onSeekLine}
        lyricsFontScale={1}
        subtitleFontScale={1}
        visualizerOpacity={1}
      />
    </div>
  );
}
