// Provider-specific interfaces
import type { MusicSource, Song } from '../types';

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  tracks?: Song[];
  trackCount?: number;
  source: MusicSource;
}
