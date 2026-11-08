// Spotify Provider & API Wrapper for Echora
import type { Song } from '../types';
import type { Playlist } from './types';

/** February 2026 reduced the search page size: 50 -> 10, default 20 -> 5. */
export const SPOTIFY_SEARCH_LIMIT_MAX = 10;

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  duration_ms: number;
  uri: string;
  is_playable?: boolean;
}

export interface SpotifyCurrentlyPlaying {
  is_playing: boolean;
  progress_ms: number;
  item: SpotifyTrack | null;
  currently_playing_type: string;
}

export class SpotifyProvider {
  private accessToken: string | null = null;

  constructor(accessToken?: string) {
    if (accessToken) this.accessToken = accessToken;
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  private async fetchSpotify<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
    if (!this.accessToken) {
      throw new Error('Spotify Access Token is missing.');
    }

    const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (response.status === 204) return null;
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Spotify API Error [${response.status}]: ${errText}`);
    }

    return (await response.json()) as T;
  }

  // 1. Get Currently Playing Track & State
  async getCurrentlyPlaying(): Promise<{ song: Song | null; isPlaying: boolean; progressMs: number }> {
    try {
      const data = await this.fetchSpotify<SpotifyCurrentlyPlaying>('/me/player/currently-playing');
      if (!data || !data.item) {
        return { song: null, isPlaying: false, progressMs: 0 };
      }

      const song: Song = {
        id: data.item.id,
        title: data.item.name,
        artists: data.item.artists.map(a => ({ id: a.id, name: a.name })),
        album: {
          id: data.item.album.id,
          name: data.item.album.name,
          coverUrl: data.item.album.images[0]?.url,
        },
        durationMs: data.item.duration_ms,
        coverUrl: data.item.album.images[0]?.url,
        audioUrl: data.item.uri,
        source: 'spotify',
      };

      return {
        song,
        isPlaying: data.is_playing,
        progressMs: data.progress_ms,
      };
    } catch (err) {
      console.warn('[Spotify] Failed to fetch currently playing:', err);
      return { song: null, isPlaying: false, progressMs: 0 };
    }
  }

  // 2. Fetch User Playlists
  //
  // February 2026: the playlist object renamed `tracks` to `items`. Content is only included for
  // playlists the user owns or collaborates on, but the count is returned for every playlist, so
  // the library list stays complete.
  async getUserPlaylists(limit = 20): Promise<Playlist[]> {
    try {
      const data = await this.fetchSpotify<{
        items: Array<{
          id: string;
          name: string;
          images: Array<{ url: string }>;
          items?: { total: number };
        }>;
      }>(`/me/playlists?limit=${limit}`);

      if (!data || !data.items) return [];

      return data.items.map(p => ({
        id: p.id,
        name: p.name,
        coverUrl: p.images[0]?.url,
        trackCount: p.items?.total || 0,
        source: 'spotify' as const,
      }));
    } catch (err) {
      console.warn('[Spotify] Failed to fetch user playlists:', err);
      return [];
    }
  }

  // 3. Fetch Tracks in a Playlist
  //
  // February 2026: `GET /playlists/{id}/tracks` was removed in favour of `/items`, and the wrapper
  // object's `track` field became `item`. Contents are only served for playlists the user owns or
  // collaborates on - anything else comes back as metadata only and yields no tracks.
  async getPlaylistTracks(playlistId: string): Promise<Song[]> {
    try {
      const data = await this.fetchSpotify<{
        items: Array<{
          item: SpotifyTrack | null;
        }>;
      }>(`/playlists/${playlistId}/items?limit=50`);

      if (!data || !data.items) return [];

      return data.items
        .filter(item => item.item !== null)
        .map(item => {
          const t = item.item!;
          return {
            id: t.id,
            title: t.name,
            artists: t.artists.map(a => ({ id: a.id, name: a.name })),
            album: {
              id: t.album.id,
              name: t.album.name,
              coverUrl: t.album.images[0]?.url,
            },
            durationMs: t.duration_ms,
            coverUrl: t.album.images[0]?.url,
            audioUrl: t.uri,
            source: 'spotify' as const,
          };
        });
    } catch (err) {
      console.warn('[Spotify] Failed to fetch playlist tracks:', err);
      return [];
    }
  }

  // 4. Search Tracks
  //
  // February 2026 lowered the search `limit` ceiling from 50 to 10 (default 20 -> 5). Asking for
  // more is rejected, so the cap is applied here rather than left to every caller.
  async searchTracks(query: string, limit = SPOTIFY_SEARCH_LIMIT_MAX): Promise<Song[]> {
    const pageSize = Math.min(Math.max(1, Math.floor(limit)), SPOTIFY_SEARCH_LIMIT_MAX);
    try {
      const data = await this.fetchSpotify<{
        tracks: {
          items: SpotifyTrack[];
        };
      }>(`/search?type=track&q=${encodeURIComponent(query)}&limit=${pageSize}`);

      if (!data || !data.tracks || !data.tracks.items) return [];

      return data.tracks.items.map(t => ({
        id: t.id,
        title: t.name,
        artists: t.artists.map(a => ({ id: a.id, name: a.name })),
        album: {
          id: t.album.id,
          name: t.album.name,
          coverUrl: t.album.images[0]?.url,
        },
        durationMs: t.duration_ms,
        coverUrl: t.album.images[0]?.url,
        audioUrl: t.uri,
        source: 'spotify' as const,
      }));
    } catch (err) {
      console.warn('[Spotify] Search failed:', err);
      return [];
    }
  }

  // 5. Playback Controls
  async play(uri?: string): Promise<boolean> {
    try {
      await this.fetchSpotify('/me/player/play', {
        method: 'PUT',
        body: uri ? JSON.stringify({ uris: [uri] }) : undefined,
      });
      return true;
    } catch {
      return false;
    }
  }

  async pause(): Promise<boolean> {
    try {
      await this.fetchSpotify('/me/player/pause', { method: 'PUT' });
      return true;
    } catch {
      return false;
    }
  }

  async next(): Promise<boolean> {
    try {
      await this.fetchSpotify('/me/player/next', { method: 'POST' });
      return true;
    } catch {
      return false;
    }
  }

  async previous(): Promise<boolean> {
    try {
      await this.fetchSpotify('/me/player/previous', { method: 'POST' });
      return true;
    } catch {
      return false;
    }
  }

  async seek(positionMs: number): Promise<boolean> {
    try {
      await this.fetchSpotify(`/me/player/seek?position_ms=${Math.max(0, Math.round(positionMs))}`, { method: 'PUT' });
      return true;
    } catch {
      return false;
    }
  }
}
