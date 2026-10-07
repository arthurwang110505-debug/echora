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
import { createStageClock } from "../playback/stageClock";
import { beginStageProbe, endStageProbe, installStageProbeGlobals } from "../utils/stageProbe";
import OriginalVisualizerRenderer from "./OriginalVisualizerRendererProxy";

/**
 * The monotonic clock the stage extrapolates against. `requestAnimationFrame` hands its callback a
 * timestamp from the same origin, so reading it here and in the frame loop stays consistent.
 */
const nowMs = (): number => (
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()
);

type OriginalMode =
  | "classic"
  | "cadenza"
  | "tempera"
  | "lumiere"
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
  songAlbum?: string;
  /**
   * Track identity, handed to the visualizers as their `seed`.
   *
   * Without it every song looks like the same song to `songHandover`'s commit gate, so a track
   * change is decided from the lyric text alone and the Pixi runtimes take their straight-through
   * `swapSong` branch (`next.seed === this.options.songSeed`): the scene cache is cleared and
   * rebuilt with no handover. Passing the id is what buys the dissolve the runtimes implement.
   */
  songId?: string | number;
  /** Track length in seconds; lets the extrapolated clock clamp instead of running past the end. */
  durationSec?: number;
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
  /**
   * Overrides the clock the stage animates from, sampled once per frame while playing.
   *
   * `displayedTime` is a prop backed by the player store, and the store is only written when the
   * media source reports in: `timeupdate` (~4x/second) for local audio, a 100 ms poll for YouTube
   * Music, a 100 ms interval for the landing preview. A stage renderer reads its position once per
   * frame and derives the whole composition from it, so forwarding that value as-is makes the
   * picture hold still between reports and then jump - which reads as a stuck stage exactly in the
   * modes whose every frame is a function of the timeline (tempera, lumiere, sonnet).
   *
   * The stage therefore extrapolates between reports itself (see playback/stageClock.ts). A
   * provider replaces that for a host that already has a better clock: the OBS overlay receives a
   * 5 Hz anchor over the wire and extrapolates it with the playback rate and lyric offset the
   * publisher sent (see src/pages/ObsStage.tsx).
   */
  timeProvider?: () => number;
}

const MODES: OriginalMode[] = [
  "classic",
  "cadenza",
  "tempera",
  "lumiere",
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
// has mounted and the browser goes idle, walk the remaining mode chunks plus the
// Pixi runtime each of the two WebGL modes loads on demand, one at a time. import.meta.glob keeps these as dynamic
// loaders, so nothing here changes the module graph for the type checker and the
// chunks are exactly the ones the lazy entries load. Switching modes later simply
// never waits on a download or a main-thread parse spike.
let hasScheduledStagePrefetch = false;

const STAGE_MODE_CHUNK_LOADERS = import.meta.glob<Promise<unknown>>(
  "../original-folia-visualizers/*/Visualizer*.tsx",
);
const STAGE_RUNTIME_CHUNK_LOADERS = import.meta.glob<Promise<unknown>>([
  "../original-folia-visualizers/sonnet/createSonnetPixiRuntime.ts",
  "../original-folia-visualizers/tempera/createTemperaPixiRuntime.ts",
  "../original-folia-visualizers/lumiere/createLumierePixiRuntime.ts",
]);

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

const shouldSkipStagePrefetch = () => {
  if (typeof window === 'undefined') return true;
  const lowCoreCount = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
  const lowMemory = typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
    && ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
  const touchDevice = navigator.maxTouchPoints > 0
    || window.matchMedia?.('(pointer: coarse)').matches === true;
  return lowCoreCount || lowMemory || touchDevice;
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
  songAlbum,
  songId,
  durationSec,
  onSeekLine,
  audioBands,
  backgroundMode = "latent",
  visualizerTunings,
  isPlayerChromeHidden = false,
  settingsOpen = false,
  timeProvider,
}: Props) {
  useEffect(() => {
    // Do not make the active player compete with downloads, module parsing, and
    // Pixi/Three initialization on phones or low-end laptops. Those chunks can
    // load on demand when the user actually switches visualizers.
    if (!shouldSkipStagePrefetch()) scheduleStagePrefetch();
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
  // Memoised, not an inline literal: the shell background and every mode read this object, and a
  // fresh identity per render defeats their memos for a value that only changes when the user picks
  // a different background.
  const background = useMemo(
    () => ({ mode: backgroundMode as any }),
    [backgroundMode],
  );
  const bands = useMemo(
    () => ({ bass, lowMid, mid, vocal, treble }),
    [bass, lowMid, mid, vocal, treble],
  );
  useEffect(() => {
    installStageProbeGlobals();
  }, []);

  // The stage's instrument cluster: it samples the main thread while a stage is mounted and labels
  // the session with the mode, so "which stage stutters, and on which device" is a measurement
  // rather than an impression. Everything here is a no-op unless the probe is switched on
  // (see utils/stageProbe.ts).
  useEffect(() => {
    beginStageProbe(mode);
    return () => endStageProbe();
  }, [mode]);

  const playingRef = useRef(isPlaying);
  const fallbackBandsRef = useRef(audioBands);
  const timeProviderRef = useRef(timeProvider);
  playingRef.current = isPlaying;
  timeProviderRef.current = timeProvider;
  fallbackBandsRef.current = audioBands;

  // `displayedTime` arrives at the rate the media source reports (see the prop's note), while the
  // stage renders at display rate. The clock turns the former into the latter; feeding it here
  // rather than in an effect keeps a report from costing a frame of latency, and `update` is a
  // handful of comparisons so calling it on every render is free.
  const stageClockRef = useRef<ReturnType<typeof createStageClock> | null>(null);
  stageClockRef.current ??= createStageClock();
  stageClockRef.current.update(
    { timeSec: safeDisplayedTime, playing: isPlaying, durationSec },
    nowMs(),
  );

  // A paused stage's rAF loop is not running (see below), so nothing else would publish a seek:
  // dragging the progress bar while paused has to move the held picture. The runtimes re-render on
  // a `currentTime` change while paused, which is what makes the new position appear.
  useEffect(() => {
    if (isPlaying) return;
    currentTime.set(safeDisplayedTime);
  }, [currentTime, isPlaying, safeDisplayedTime]);

  useEffect(() => {
    const toMotionBandValue = (value: number) => {
      const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
      return Math.min(255, safeValue <= 1 ? safeValue * 255 : safeValue);
    };

    let frame = 0;
    const tick = () => {
      // The stage used to keep sampling audio and writing all five MotionValues
      // forever, including while paused. That loop ran alongside every scene's
      // own renderer and was especially expensive on mobile.
      if (!playingRef.current) {
        frame = 0;
        return;
      }

      const playing = playingRef.current;
      // A provider is sampled per frame when the host has a better clock than the store does;
      // otherwise the store's position is extrapolated forward to this frame (playback/stageClock).
      const time = timeProviderRef.current
        ? timeProviderRef.current()
        : stageClockRef.current!.read(nowMs());
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

    if (isPlaying) {
      frame = window.requestAnimationFrame(tick);
    } else {
      bass.set(0);
      lowMid.set(0);
      mid.set(0);
      vocal.set(0);
      treble.set(0);
      audioPower.set(0);
    }

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [audioPower, bass, currentTime, isPlaying, lowMid, mid, treble, vocal]);

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
          background={background}
          visualizerTunings={visualizerTunings as any}
          showText
          seed={songId}
          songTitle={songTitle}
          songArtist={songArtist}
          songAlbum={songAlbum}
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
