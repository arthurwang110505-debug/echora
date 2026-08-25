// Agnes AI theme types
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

export type AiProvider = 'agnes';

/**
 * Provider metadata for integrations that need to label the active AI service.
 * Secrets are intentionally not part of the client/core contract; Agnes credentials
 * belong in the server-side runtime environment.
 */
export interface AiProviderConfig {
  provider: 'agnes';
  apiUrl?: string;
  model?: string;
  temperature?: number;
}
