// Sync interfaces

export interface SyncData {
  visualSettings: VisualSettings;
  aiThemes: AiThemeRecord[];
  favorites: FavoriteRecord[];
  lastSync?: number;
}

export interface VisualSettings {
  activeVisualizer: string;
  visualizerParams: Record<string, unknown>;
  theme: ThemePreset;
}

export interface ThemePreset {
  name: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export interface ThemeColors {
  backgroundColor: string;
  primaryColor: string;
  accentColor: string;
  secondaryColor: string;
}

export interface AiThemeRecord {
  songId: string;
  songTitle: string;
  artist: string;
  light: ThemeColors;
  dark: ThemeColors;
  generatedAt: number;
}

export interface FavoriteRecord {
  songId: string;
  title: string;
  artist: string;
  addedAt: number;
}
