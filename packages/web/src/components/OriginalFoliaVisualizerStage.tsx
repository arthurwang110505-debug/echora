import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useMotionValue } from "framer-motion";
import type { Line, ThemeConfig } from "@echora/core";
import i18n from "../i18n";
import { resolveStageAudioBands } from "../playback/audioBands";
import { sampleLocalAudioBands } from "../playback/localAudioAnalyser";
import OriginalVisualizerRenderer from "./OriginalVisualizerRendererProxy";

type OriginalMode =
  | "classic"
  | "cadenza"
  | "partita"
  | "fume"
  | "monet"
  | "cappella"
  | "pendolo"
  | "sonnet"
  | "claddagh"
  | "diorama"
  | "tilt";

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
  audioBands?: {
    bass: number;
    lowMid: number;
    mid: number;
    vocal: number;
    treble: number;
  };
  backgroundMode?: string;
  visualizerTunings?: Record<string, unknown>;
  isPlayerChromeHidden?: boolean;
  settingsOpen?: boolean;
}

const MODES: OriginalMode[] = [
  "classic",
  "cadenza",
  "partita",
  "fume",
  "monet",
  "cappella",
  "pendolo",
  "sonnet",
  "claddagh",
  "diorama",
  "tilt",
];

// Each mode's scene ships in its own chunk (see lazyVisualizer). After the player
// has mounted and the browser goes idle, walk the remaining mode chunks plus
// Sonnet's Pixi runtime one at a time. import.meta.glob keeps these as dynamic
// loaders, so nothing here changes the module graph for the type checker and the
// chunks are exactly the ones the lazy entries load. Switching modes later simply
// never waits on a download or a main-thread parse spike.
let hasScheduledStagePrefetch = false;

const STAGE_MODE_CHUNK_LOADERS = import.meta.glob<Promise<unknown>>(
  "../original-folia-visualizers/*/Visualizer*.tsx",
);
const STAGE_RUNTIME_CHUNK_LOADERS = import.meta.glob<Promise<unknown>>(
  "../original-folia-visualizers/sonnet/createSonnetPixiRuntime.ts",
);

const scheduleStagePrefetch = () => {
  if (hasScheduledStagePrefetch || typeof window === "undefined") return;
  hasScheduledStagePrefetch = true;

  const preloadJobs = [
    ...Object.values(STAGE_MODE_CHUNK_LOADERS),
    ...Object.values(STAGE_RUNTIME_CHUNK_LOADERS),
  ];

  const runSequentially = async () => {
    for (const job of preloadJobs) {
      try {
        await job();
      } catch {
        // Prefetching is best effort; the mode's own loader retries on demand.
      }
    }
  };

  const idleApi = (
    window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
    }
  ).requestIdleCallback;
  if (typeof idleApi === "function") {
    idleApi(
      () => {
        void runSequentially();
      },
      { timeout: 6000 },
    );
  } else {
    window.setTimeout(() => {
      void runSequentially();
    }, 2500);
  }
};

class SceneErrorBoundary extends Component<
  {
    children: ReactNode;
    mode: OriginalMode;
    onError?: (error: Error, info: ErrorInfo) => void;
    onRetry?: () => void;
    onFallback?: () => void;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `Echora ${this.props.mode} visualizer scene failed.`,
      error,
      info,
    );
    this.props.onError?.(error, info);
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full items-center justify-center bg-[#07090e] p-6 text-center text-sm text-slate-300">
          <div className="max-w-sm space-y-3">
            <p className="font-semibold text-white">
              {i18n.t('player.sceneLoadFailed', { mode: this.props.mode })}
            </p>
            <p className="text-xs leading-5 text-slate-400">
              {i18n.t('player.sceneFallbackCopy')}
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  this.setState({ failed: false });
                  this.props.onRetry?.();
                }}
                className="rounded-xl border border-[#62f5c4]/30 bg-[#62f5c4]/10 px-3 py-2 text-xs font-bold text-[#b8ffe2] hover:bg-[#62f5c4]/20"
              >
                {i18n.t('player.retryScene', { mode: this.props.mode })}
              </button>
              {this.props.mode !== "classic" && (
                <button
                  type="button"
                  onClick={this.props.onFallback}
                  className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
                >
                  {i18n.t('player.switchToClassic')}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const toOriginalTheme = (theme: ThemeConfig) => ({
  name: theme.name,
  backgroundColor: theme.backgroundColor || "#07090e",
  primaryColor: theme.primaryColor || "#62f5c4",
  accentColor: theme.accentColor || "#62f5c4",
  secondaryColor: theme.secondaryColor || "#6366f1",
  fontStyle: theme.fontStyle || "sans",
  animationIntensity: "normal" as const,
  fontWeight: 700,
});

export default function OriginalFoliaVisualizerStage({
  lines,
  activeLineIndex,
  displayedTime,
  isPlaying = false,
  theme,
  visualizerMode = "classic",
  coverUrl,
  songTitle,
  songArtist,
  onSeekLine,
  audioBands,
  backgroundMode = "latent",
  visualizerTunings,
  isPlayerChromeHidden = false,
  settingsOpen = false,
}: Props) {
  useEffect(() => {
    scheduleStagePrefetch();
  }, []);
  const safeDisplayedTime =
    Number.isFinite(displayedTime) && displayedTime >= 0 ? displayedTime : 0;
  const currentTime = useMotionValue(safeDisplayedTime);
  const audioPower = useMotionValue(isPlaying ? 200 : 0);
  const bass = useMotionValue(0);
  const lowMid = useMotionValue(0);
  const mid = useMotionValue(0);
  const vocal = useMotionValue(0);
  const treble = useMotionValue(0);
  const mode = (
    MODES.includes(visualizerMode as OriginalMode) ? visualizerMode : "classic"
  ) as OriginalMode;
  // Echora stores lyric timestamps in milliseconds; Folia's renderer contract
  // is seconds. Passing the values through unchanged makes every animation
  // enter/exit phase drift by 1000x.
  const originalLines = useMemo(
    () =>
      lines.map((line) => ({
        ...line,
        startTime: Number.isFinite(line.startTime) ? line.startTime / 1000 : 0,
        endTime: Number.isFinite(line.endTime) ? line.endTime / 1000 : 0,
        words: (line.words || []).map((word) => ({
          ...word,
          startTime: Number.isFinite(word.startTime)
            ? word.startTime / 1000
            : 0,
          endTime: Number.isFinite(word.endTime) ? word.endTime / 1000 : 0,
          syllables: word.syllables?.map((syllable) => ({
            ...syllable,
            startTime: syllable.startTime / 1000,
            endTime: syllable.endTime / 1000,
          })),
        })),
      })),
    [lines],
  );
  const originalTheme = useMemo(() => toOriginalTheme(theme), [theme]);
  const bands = useMemo(
    () => ({ bass, lowMid, mid, vocal, treble }),
    [bass, lowMid, mid, vocal, treble],
  );
  const playingRef = useRef(isPlaying);
  const timeRef = useRef(safeDisplayedTime);
  const fallbackBandsRef = useRef(audioBands);
  playingRef.current = isPlaying;
  timeRef.current = safeDisplayedTime;
  fallbackBandsRef.current = audioBands;

  useEffect(() => {
    const toMotionBandValue = (value: number) => {
      const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
      return Math.min(255, safeValue <= 1 ? safeValue * 255 : safeValue);
    };

    let frame = 0;
    const tick = () => {
      const playing = playingRef.current;
      const time = timeRef.current;
      const levels = resolveStageAudioBands({
        isPlaying: playing,
        displayedTime: time,
        liveBands: sampleLocalAudioBands(playing),
        fallbackBands: fallbackBandsRef.current,
      });
      bass.set(toMotionBandValue(levels.bass));
      lowMid.set(toMotionBandValue(levels.lowMid));
      mid.set(toMotionBandValue(levels.mid));
      vocal.set(toMotionBandValue(levels.vocal));
      treble.set(toMotionBandValue(levels.treble));
      currentTime.set(time);
      audioPower.set(playing ? 70 + levels.bass * 150 + levels.mid * 40 : 0);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [audioPower, bass, currentTime, lowMid, mid, treble, vocal]);

  return (
    <div
      className="relative h-full min-h-0 w-full overflow-hidden"
      data-settings-open={settingsOpen ? "true" : undefined}
    >
      <SceneErrorBoundary
        key={mode}
        mode={mode}
        onError={(error) =>
          console.error(`Echora visualizer error in ${mode}:`, error)
        }
        onRetry={() => currentTime.set(safeDisplayedTime)}
        onFallback={() =>
          window.dispatchEvent(
            new CustomEvent("echora:visualizer-fallback", { detail: { mode } }),
          )
        }
      >
        <OriginalVisualizerRenderer
          mode={mode}
          currentTime={currentTime}
          currentLineIndex={Math.max(
            0,
            Math.min(activeLineIndex, Math.max(0, originalLines.length - 1)),
          )}
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
          isPlayerChromeHidden={isPlayerChromeHidden}
          onLyricLineSeek={onSeekLine}
          lyricsFontScale={1}
          subtitleFontScale={1}
          visualizerOpacity={1}
        />
      </SceneErrorBoundary>
    </div>
  );
}
