// Lyrics types
import type { LyricSession, LyricFormat } from '../types';
export type { LyricLine, LyricWord, LyricSession, LyricSource, LyricFormat } from '../types';

export interface ParsedLyrics {
  format: LyricFormat;
  session: LyricSession;
  raw: string;
}
