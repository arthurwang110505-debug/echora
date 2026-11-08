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

/**
 * One place that turns a Web API track object into Echora's `Song`. Three endpoints returned the
 * identical shape and had drifted apart only in whitespace; a field rename now lands once.
 */
const toSong = (t: SpotifyTrack): Song => ({
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
});

/**
 * Pulls the playlist ID out of anything a listener is likely to paste: an open.spotify.com link
 * (with or without a locale segment, query string or `?si=` share token), a `spotify:playlist:` URI,
 * or the bare ID. Anything else - a track link, an album link, a profile - returns null, because
 * guessing would open the wrong thing.
 */
export const parseSpotifyPlaylistId = (input: string): string | null => {
  const value = input.trim();
  if (!value) return null;

  // Bare ID: 22 base-62 characters. Spotify IDs never contain a slash or a dot, so a pasted URL
  // cannot match this by accident.
  if (/^[0-9A-Za-z]{22}$/.test(value)) return value;

  const uri = /^spotify:playlist:([0-9A-Za-z]{22})$/.exec(value);
  if (uri) return uri[1];

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.hostname !== 'open.spotify.com' && url.hostname !== 'play.spotify.com') return null;

  // `/playlist/{id}` or `/{locale}/playlist/{id}`; intl paths carry a two-letter prefix.
  const match = /(?:^|\/)(?:intl-[a-z-]+\/)?playlist\/([0-9A-Za-z]{22})(?:$|\/)/.exec(url.pathname);
  return match ? match[1] : null;
};

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

      const song = toSong(data.item);

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

  // 3a. Read a playlist that came in as a pasted link.
  //
  // February 2026 made this a two-step: `GET /playlists/{id}` always answers with the metadata
  // (name, cover, name of the owner), but `items` - the contents - is only present when the user
  // owns or collaborates on the playlist. So the caller gets the playlist plus whatever tracks were
  // available, and an empty track list simply means "not yours".
  async getPlaylist(playlistId: string): Promise<{ playlist: Playlist; tracks: Song[] }> {
    const data = await this.fetchSpotify<{
      id: string;
      name: string;
      owner?: { display_name?: string };
      images?: Array<{ url: string }>;
      items?: {
        total?: number;
        items?: Array<{ item: SpotifyTrack | null }>;
      };
    }>(`/playlists/${playlistId}`);

    if (!data) throw new Error('Spotify playlist not found.');

    const playlist: Playlist = {
      id: data.id,
      name: data.name,
      coverUrl: data.images?.[0]?.url,
      trackCount: data.items?.total || 0,
      source: 'spotify',
    };

    // `GET /playlists/{id}` embeds only the first page; the rest needs the items endpoint, which
    // refuses non-collaborative playlists anyway.
    const embedded = data.items?.items;
    const tracks = embedded
      ? embedded.filter(entry => entry.item !== null).map(entry => toSong(entry.item!))
      : await this.getPlaylistTracks(playlistId);

    return { playlist, tracks };
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
        .map(item => toSong(item.item!));
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

      return data.tracks.items.map(toSong);
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
