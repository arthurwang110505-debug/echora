// AI Theme types
import type { ThemeConfig } from '../types';
export type { ThemeConfig } from '../types';

export interface AiThemeRequest {
  lyricsText: string;
  isPureMusic: boolean;
  songTitle?: string;
}

export interface AiThemeResponse {
  light: ThemeConfig;
  dark: ThemeConfig;
}

export type AiProvider = 'gemini' | 'openai';

export interface AiProviderConfig {
  provider: AiProvider;
  apiKey: string;
  apiUrl?: string;
  model?: string;
  temperature?: number;
}
