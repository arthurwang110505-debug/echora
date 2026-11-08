import { create } from 'zustand';

const STAGE_PREFS_KEY = 'echora.stage-prefs';
const LYRICS_OFFSETS_KEY = 'echora.lyrics-offsets';

export type StagePrefs = {
  activeVisualizer: string;
  backgroundMode: string;
  autoVisualizer: boolean;
  visualizerTunings: Record<string, unknown>;
  /** Hides the player page's blurred cover/glow backdrop (the panel's top-right cover button). */
  transparentBackground: boolean;
  /**
   * The 靈動詞島 overlay in the player: the current line in a small pill over the stage.
   * Off by default - it is a second lyric surface on top of one that is already showing the same
   * line, so it has to be asked for.
   */
  lyricsIsland: boolean;
};

const DEFAULT_PREFS: StagePrefs = {
  activeVisualizer: 'classic',
  backgroundMode: 'latent',
  autoVisualizer: false,
  visualizerTunings: {},
  transparentBackground: false,
  lyricsIsland: false,
};

const readJson = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) || 'null');
    return stored && typeof stored === 'object' ? stored as T : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is optional; a full disk must never block playback.
  }
};

export const songOffsetKey = (song: { source: string; id: string } | null | undefined) => (
  song ? `${song.source}:${song.id}` : ''
);

type StageState = StagePrefs & {
  lyricsOffsets: Record<string, number>;
  setActiveVisualizer: (activeVisualizer: string) => void;
  setBackgroundMode: (backgroundMode: string) => void;
  setAutoVisualizer: (autoVisualizer: boolean) => void;
  setTransparentBackground: (transparentBackground: boolean) => void;
  setLyricsIsland: (lyricsIsland: boolean) => void;
  setVisualizerTunings: (visualizerTunings: Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown>)) => void;
  setLyricsOffset: (key: string, offsetSeconds: number) => void;
  getLyricsOffset: (key: string) => number;
};

const persistPrefs = (state: StageState) => {
  writeJson(STAGE_PREFS_KEY, {
    activeVisualizer: state.activeVisualizer,
    backgroundMode: state.backgroundMode,
    autoVisualizer: state.autoVisualizer,
    visualizerTunings: state.visualizerTunings,
    transparentBackground: state.transparentBackground,
    lyricsIsland: state.lyricsIsland,
  });
};

export const useStageStore = create<StageState>((set, get) => {
  const storedPrefs = readJson<Partial<StagePrefs>>(STAGE_PREFS_KEY, {});
  const lyricsOffsets = readJson<Record<string, number>>(LYRICS_OFFSETS_KEY, {});

  return {
    ...DEFAULT_PREFS,
    ...storedPrefs,
    visualizerTunings: storedPrefs.visualizerTunings && typeof storedPrefs.visualizerTunings === 'object'
      ? storedPrefs.visualizerTunings
      : {},
    lyricsOffsets,
    setActiveVisualizer: (activeVisualizer) => {
      set({ activeVisualizer });
      persistPrefs(get());
    },
    setBackgroundMode: (backgroundMode) => {
      set({ backgroundMode });
      persistPrefs(get());
    },
    setTransparentBackground: (transparentBackground) => {
      set({ transparentBackground });
      persistPrefs(get());
    },
    setLyricsIsland: (lyricsIsland) => {
      set({ lyricsIsland });
      persistPrefs(get());
    },
    setAutoVisualizer: (autoVisualizer) => {
      set({ autoVisualizer });
      persistPrefs(get());
    },
    setVisualizerTunings: (visualizerTunings) => {
      const next = typeof visualizerTunings === 'function'
        ? visualizerTunings(get().visualizerTunings)
        : visualizerTunings;
      set({ visualizerTunings: next });
      persistPrefs(get());
    },
    setLyricsOffset: (key, offsetSeconds) => {
      if (!key) return;
      const lyricsOffsets = { ...get().lyricsOffsets, [key]: offsetSeconds };
      if (offsetSeconds === 0) delete lyricsOffsets[key];
      writeJson(LYRICS_OFFSETS_KEY, lyricsOffsets);
      set({ lyricsOffsets });
    },
    getLyricsOffset: (key) => get().lyricsOffsets[key] || 0,
  };
});
