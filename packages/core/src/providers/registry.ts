// Provider registry
// Uses types from both providers/types.ts and ../types

import type { MusicSource, ProviderConfig, Song, SearchRequest, SearchResponse } from '../types';
import type { Playlist } from './types';

// Extend SearchResponse to use our Playlist type
export interface ExtendedSearchResponse extends SearchResponse {
  playlists: Playlist[];
}

// Provider registry
const providers = new Map<MusicSource, ProviderConfig>();
const providerSearchers = new Map<MusicSource, (query: string, options: { limit: number; offset: number }) => Promise<ExtendedSearchResponse>>();
const audioUrlGetters = new Map<MusicSource, (song: Song) => Promise<string | null>>();
const lyricFetchers = new Map<MusicSource, (song: Song) => Promise<any>>;

// Register a provider
export function registerProvider(config: ProviderConfig) {
  providers.set(config.id, config);
}

// Get a provider
export function getProvider(id: MusicSource): ProviderConfig | undefined {
  return providers.get(id);
}

// Get all enabled providers
export function getEnabledProviders(): ProviderConfig[] {
  return Array.from(providers.values()).filter(p => p.enabled);
}

// Search songs across providers
export async function searchSongs(request: SearchRequest): Promise<ExtendedSearchResponse> {
  const { query, limit = 20, offset = 0 } = request;

  for (const provider of getEnabledProviders()) {
    const searcher = providerSearchers.get(provider.id);
    if (searcher) {
      try {
        const results = await searcher(query, { limit, offset });
        if (results.tracks.length > 0 || results.playlists.length > 0) {
          return results;
        }
      } catch (error) {
        console.warn(`Provider ${provider.id} search failed:`, error);
      }
    }
  }

  return { tracks: [], playlists: [] } as ExtendedSearchResponse;
}

export function registerSearcher(source: MusicSource, searcher: typeof providerSearchers extends Map<MusicSource, infer F> ? F : never) {
  providerSearchers.set(source, searcher);
}

// Get song audio URL
export async function getAudioUrl(song: Song): Promise<string | null> {
  const getter = audioUrlGetters.get(song.source);
  if (getter) {
    try {
      return await getter(song);
    } catch {
      return null;
    }
  }
  return song.audioUrl || null;
}

export function registerAudioUrlGetter(source: MusicSource, getter: (song: Song) => Promise<string | null>) {
  audioUrlGetters.set(source, getter);
}

// Get lyrics for a song
export async function getLyrics(song: Song): Promise<any> {
  if ((song as any).lyrics) return (song as any).lyrics;

  const lyricFetcher = lyricFetchers.get(song.source);
  if (lyricFetcher) {
    try {
      return await lyricFetcher(song);
    } catch {
      return null;
    }
  }
  return null;
}

export function registerLyricFetcher(source: MusicSource, fetcher: (song: Song) => Promise<any>) {
  lyricFetchers.set(source, fetcher);
}
