// Echora shared types for the lyrics stage

// ============ LYRICS (Simplified for mobile) ============

export interface LyricWord {
  time: number;
  text: string;
  end?: number;
}

export interface LyricLine {
  time: number;
  text: string;
  words?: LyricWord[];
  isChorus?: boolean;
}

export interface LyricSession {
  lines: LyricLine[];
  source: LyricSource;
  timingOffset?: number;
}

export type LyricSource =
  | 'netease'
  | 'qq'
  | 'kugou'
  | 'local'
  | 'embedded'
  | 'ytmusic'
  | 'transl';

export type LyricFormat = 'lrc' | 'yrc' | 'vtt' | 'qrc' | 'ttml' | 'krc' | 'txt';

// ============ THEME ============

export interface ThemeConfig {
  name: string;
  backgroundColor: string;
  primaryColor: string;
  accentColor: string;
  secondaryColor: string;
  wordColors?: { word: string; color: string }[];
  lyricsIcons?: string[];
  fontStyle?: 'sans' | 'serif' | 'mono';
  provider?: string;
}

// ============ PARAM SCHEMA ============

export interface ParamSchema {
  key: string;
  label: string;
  labelZh: string;
  type: 'number' | 'select' | 'boolean' | 'color';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string; labelZh: string }[];
  defaultValue: unknown;
}

// ============ VISUALIZER ID ============

export type VisualizerId =
  | 'liuguang'
  | 'xinxiang'
  | 'yunjie'
  | 'fuming'
  | 'qunchang'
  | 'qingsu'
  | 'moni';

// ============ MUSIC SOURCE ============

export type MusicSource =
  | 'spotify'
  | 'ytmusic'
  | 'local'
  | 'netease'
  | 'qq'
  | 'kugou';

// ============ LEGACY LYRICS TYPES (kept for compatibility) ============

// Original lyrics types (more complex)
export interface LyricRuby {
  text: string;
  startTime: number;
  endTime: number;
}

export interface LyricSyllable {
  text: string;
  startTime: number;
  endTime: number;
  endsWithSpace?: boolean;
  ruby?: LyricRuby[];
  obscene?: boolean;
  emptyBeat?: number;
}

export interface LyricAlternateText {
  role: 'translation' | 'romanization' | string;
  language?: string;
  text: string;
  syllables?: LyricSyllable[];
}

export interface Word {
  text: string;
  startTime: number;
  endTime: number;
  syllables?: LyricSyllable[];
}

export interface Line {
  words: Word[];
  startTime: number;
  endTime: number;
  fullText: string;
  translation?: string;
  romanization?: string;
  alternateTexts?: LyricAlternateText[];
  renderHints?: LineRenderHints;
  isChorus?: boolean;
  chorusEffect?: 'bars' | 'circles' | 'beams';
}

export interface LineRenderHints {
  wordColors?: Record<string, string>;
  fontSize?: number;
  fontWeight?: number;
  animationIntensity?: number;
}

export interface LyricData {
  lines: Line[];
  title?: string;
  artist?: string;
  isWordByWord?: boolean;
}

export type LyricParseFormat = 'lrc' | 'enhanced-lrc' | 'yrc' | 'qrc' | 'krc' | 'vtt' | 'ttml';

export interface LyricProcessingOptions {
  includeInterludes?: boolean;
  filterPattern?: string | null;
  songId?: number;
}

// Theme (original)
export interface Theme {
  name: string;
  backgroundColor: string;
  primaryColor: string;
  accentColor: string;
  secondaryColor: string;
  fontStyle: 'sans' | 'serif' | 'mono';
  fontFamily?: string;
  fontFamilyStack?: string[];
  fontWeight?: number;
  animationIntensity: 'calm' | 'normal' | 'chaotic';
  wordColors?: { word: string; color: string }[];
  lyricsIcons?: string[];
  provider?: string;
  description?: string;
}

export interface DualTheme {
  light: Theme;
  dark: Theme;
}

export type ThemeMode = 'default' | 'ai' | 'custom';

// Visualizer modes (original)
export type BuiltinVisualizerMode = 'classic' | 'cadenza' | 'partita' | 'fume' | 'monet' | 'cappella' | 'pendolo' | 'sonnet' | 'claddagh' | 'diorama' | 'tilt';
export type VisualizerMode = BuiltinVisualizerMode | (string & {});
export type VisualizerTuningKind = 'none' | 'classic' | 'cadenza' | 'partita' | 'fume' | 'claddagh' | 'cappella' | 'tilt' | 'monet' | 'diorama' | 'pendolo' | 'sonnet';

// Tuning interfaces
export interface ClassicTuning {
  enableWordRotation: boolean;
  breathingFloatMultiplier: number;
  useLegacyLayout?: boolean;
  wordSpacing?: number;
}
export const DEFAULT_CLASSIC_TUNING: ClassicTuning = {
  enableWordRotation: true,
  breathingFloatMultiplier: 1,
  useLegacyLayout: false,
  wordSpacing: 0.7,
};

export interface FumeTuning {
  hidePrintSymbols: boolean;
  disableGeometricBackground: boolean;
  backgroundObjectOpacity: number;
  textHoldRatio: number;
  cameraTrackingMode: 'stepped' | 'smooth';
  cameraSpeed: number;
  glowIntensity: number;
  heroScale: number;
}
export const DEFAULT_FUME_TUNING: FumeTuning = {
  hidePrintSymbols: false,
  disableGeometricBackground: true,
  backgroundObjectOpacity: 0.5,
  textHoldRatio: 1,
  cameraTrackingMode: 'smooth',
  cameraSpeed: 1,
  glowIntensity: 1,
  heroScale: 1,
};

export interface CappellaTuning {
  showEmoMessages: boolean;
  avatarSource: 'cover' | 'builtin' | 'color' | 'custom';
  emojiPackSource: 'builtin' | 'custom';
}
export const DEFAULT_CAPPELLA_TUNING: CappellaTuning = {
  showEmoMessages: true,
  emojiPackSource: 'builtin',
  avatarSource: 'cover',
};

// Audio
export interface AudioBands {
  bass: number;
  lowMid: number;
  mid: number;
  vocal: number;
  treble: number;
}

// Song
export type LyricProviderSource = 'netease' | 'qq' | 'kugou' | 'amll';

export interface Artist {
  id: string | number;
  name: string;
}

export interface Album {
  id: string | number;
  name: string;
  coverUrl?: string;
}

export interface Song {
  id: string;
  title: string;
  artists: Artist[];
  album?: Album;
  durationMs?: number;
  coverUrl?: string;
  audioUrl?: string;
  lyrics?: LyricData;
  source: MusicSource;
  isPureMusic?: boolean;
  matchedLyricsSource?: LyricProviderSource;
}

// Playback
export enum PlayerState {
  IDLE = 'IDLE',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
}

// Provider
export interface ProviderConfig {
  id: MusicSource;
  name: string;
  nameZh: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface SearchRequest {
  query: string;
  source?: MusicSource;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  tracks: Song[];
  playlists: Array<{ id: string; name: string; coverUrl?: string; }>;
}
