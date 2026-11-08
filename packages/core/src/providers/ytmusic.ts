// YouTube Music Provider for Echora
import type { Song, YouTubeVideoKind } from '../types';
import type { Playlist } from './types';
import { requestYouTubeJson } from './youtubeRequest';

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Normalizes a raw video ID, a watch URL, a short URL, or an embed URL to a YouTube video ID. */
export const extractYouTubeVideoId = (value?: string | null): string | null => {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (YOUTUBE_VIDEO_ID.test(candidate)) return candidate;

  try {
    const url = new URL(candidate);
    const host = url.hostname.replace(/^www\./, '');
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const possibleId = host === 'youtu.be'
      ? pathSegments[0]
      : url.searchParams.get('v') || (['embed', 'shorts', 'live'].includes(pathSegments[0]) ? pathSegments[1] : null);
    return possibleId && YOUTUBE_VIDEO_ID.test(possibleId) ? possibleId : null;
  } catch {
    return null;
  }
};

/** Converts the ISO 8601 duration returned by YouTube Data API into milliseconds. */
export const parseYouTubeDuration = (value?: string | null): number | undefined => {
  if (!value) return undefined;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!match) return undefined;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const durationMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
  return Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : undefined;
};

/** Uses the official YouTube category when available; missing metadata never guesses music. */
export const resolveYouTubeVideoKind = (categoryId?: string | null): YouTubeVideoKind => (
  categoryId === '10' ? 'music' : categoryId ? 'video' : 'unknown'
);

// Safety caps for pagination. Paging stops early when the API stops returning
// pages; these only guard against an accidental unbounded loop.
const MAX_PLAYLIST_PAGES = 20; // 50 per page → up to 1000 playlists
const MAX_TRACK_PAGES = 20; // 50 per page → up to 1000 tracks

/**
 * How many tracks one playlist load brings back by default.
 *
 * The previous code paged to 5,000 tracks, one request every 50, strictly in series, before the
 * player could show anything. 300 is six requests: enough that scrolling a normal playlist never
 * hits the end, few enough that opening one does not burn a noticeable slice of the daily quota.
 * `hasMore` tells the caller the list is truncated instead of silently lying about its length.
 */
export const DEFAULT_TRACK_LIMIT = 300;

/** Playlist list changes rarely and is the first thing a reconnect re-fetches. */
const PLAYLISTS_TTL_MS = 60_000;
/** Tracks change more often (a song added on the phone), but not by the second. */
const TRACKS_TTL_MS = 5 * 60_000;
/** `videos.list` accepts 50 ids per call; three calls in flight is polite and ~3x faster. */
const METADATA_CONCURRENCY = 3;

interface CacheEntry<T> { expiresAt: number; value: T; }

/**
 * A short fingerprint of the access token.
 *
 * Used only as a cache key component: caching playlists under a bare `mine=true` means the next
 * account sees the previous one's library until the TTL expires. A hash rather than the token
 * itself so a token cannot leak through a debugger view of the cache or an error report.
 */
const tokenFingerprint = (token: string | null): string => {
  if (!token) return 'anonymous';
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

/**
 * Runs `task` over `items` with at most `limit` in flight, preserving input order.
 *
 * `Promise.all` over the whole list would open one request per 50 tracks - a 1,000-track playlist
 * would fire twenty at once and trip Google's per-user rate limit, which is a slower failure than
 * being polite. A hand-rolled worker pool keeps the batching behaviour and just widens it.
 */
const mapWithConcurrency = async <T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  }));
  return results;
};

/** A non-fatal data-layer failure, for diagnostics. */
export interface YouTubeDataDiagnostic {
  name: 'youtube_metadata_unavailable' | 'youtube_tracks_truncated';
  details: Record<string, string | number | boolean>;
}

export interface YouTubeMusicProviderOptions {
  /**
   * Where a swallowed failure goes.
   *
   * Injected rather than imported: `packages/core` must not reach into `packages/web` for its
   * diagnostics store, and a test can assert the report without a browser.
   */
  onDiagnostic?: (event: YouTubeDataDiagnostic) => void;
}

/** One playlist load: the tracks, plus whether the player is looking at all of them. */
export interface PlaylistTracksResult {
  tracks: Song[];
  hasMore: boolean;
}

export interface YTTrack {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  thumbnailUrl?: string;
  durationMs?: number;
}

export interface YouTubeProfile { name: string; avatarUrl?: string; channelId?: string; }

interface YouTubeVideoMetadata {
  videoId: string;
  categoryId?: string;
  duration?: string;
  embeddable?: boolean;
}

export class YouTubeMusicProvider {
  private accessToken: string | null = null;
  private readonly playlistsCache = new Map<string, CacheEntry<Playlist[]>>();
  private readonly tracksCache = new Map<string, CacheEntry<PlaylistTracksResult>>();
  private readonly onDiagnostic?: (event: YouTubeDataDiagnostic) => void;

  constructor(options: YouTubeMusicProviderOptions = {}) {
    this.onDiagnostic = options.onDiagnostic;
  }

  /**
   * Points the provider at a different account (or none).
   *
   * Caches are keyed by a token fingerprint as well, but clearing here is the belt to that braces:
   * a re-connect issues a new token, and the first thing the user does is open the library - they
   * must not see the previous account's playlists for the next sixty seconds.
   */
  setAccessToken(token: string | null) {
    if (token !== this.accessToken) {
      this.playlistsCache.clear();
      this.tracksCache.clear();
    }
    this.accessToken = token;
  }

  /** Test seam: forget every cached response. */
  clearCache() {
    this.playlistsCache.clear();
    this.tracksCache.clear();
  }

  private cacheKey(scope: string) {
    return `${tokenFingerprint(this.accessToken)}:${scope}`;
  }

  private readCache<T>(cache: Map<string, CacheEntry<T>>, key: string, now = Date.now()): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) { cache.delete(key); return null; }
    return entry.value;
  }

  private writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number, now = Date.now()) {
    cache.set(key, { expiresAt: now + ttlMs, value });
  }

  /**
   * One authenticated Data API request.
   *
   * Timeout, retry and the structured failure reason all live in
   * `youtubeRequest.ts`; this only supplies the token. The thrown error is a
   * `YouTubeApiError`, whose `message` keeps the historical
   * `YouTube API failed: <status> (<reason>)` shape so existing callers and
   * UI copy keep working while the store migrates to reading `reason`/`status`.
   */
  private async authorized<T>(url: string): Promise<T> {
    if (!this.accessToken) throw new Error('YouTube 尚未登入');
    return requestYouTubeJson<T>(url, { accessToken: this.accessToken });
  }

  async getUserPlaylists(): Promise<Playlist[]> {
    const key = this.cacheKey('playlists');
    const cached = this.readCache(this.playlistsCache, key);
    if (cached) return cached;

    type PlaylistResponse = { nextPageToken?: string; items?: Array<{ id: string; snippet: { title: string; thumbnails?: { medium?: { url: string } } }; contentDetails?: { itemCount: number } }> };
    const items: NonNullable<PlaylistResponse['items']> = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PLAYLIST_PAGES; page += 1) {
      const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const data = await this.authorized<PlaylistResponse>(`https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50${token}`);
      items.push(...(data.items || []));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    const playlists = items.map(item => ({ id: item.id, name: item.snippet.title, coverUrl: item.snippet.thumbnails?.medium?.url, trackCount: item.contentDetails?.itemCount, source: 'ytmusic' as const }));
    this.writeCache(this.playlistsCache, key, playlists, PLAYLISTS_TTL_MS);
    return playlists;
  }

  async getProfile(): Promise<YouTubeProfile | null> {
    const data = await this.authorized<{ items?: Array<{ id: string; snippet?: { title?: string; thumbnails?: { default?: { url: string } } } }> }>('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true');
    const item = data.items?.[0];
    return item ? { channelId: item.id, name: item.snippet?.title || 'YouTube Music', avatarUrl: item.snippet?.thumbnails?.default?.url } : null;
  }

  private async getVideoMetadata(videoIds: string[]): Promise<Map<string, YouTubeVideoMetadata>> {
    type VideosResponse = { items?: Array<{ id: string; snippet?: { categoryId?: string }; contentDetails?: { duration?: string }; status?: { embeddable?: boolean } }> };

    const batches: string[][] = [];
    for (let start = 0; start < videoIds.length; start += 50) {
      const ids = videoIds.slice(start, start + 50);
      if (ids.length > 0) batches.push(ids);
    }

    // Bounded concurrency, not `Promise.all`: a 1,000-track playlist is twenty batches, and twenty
    // simultaneous requests is how a per-user rate limit gets tripped.
    const responses = await mapWithConcurrency(batches, METADATA_CONCURRENCY, ids => (
      this.authorized<VideosResponse>(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${encodeURIComponent(ids.join(','))}`)
    ));

    const metadata = new Map<string, YouTubeVideoMetadata>();
    for (const data of responses) {
      for (const item of data.items || []) {
        metadata.set(item.id, {
          videoId: item.id,
          categoryId: item.snippet?.categoryId,
          duration: item.contentDetails?.duration,
          embeddable: item.status?.embeddable,
        });
      }
    }
    return metadata;
  }

  /**
   * The tracks in one playlist, up to `limit`, with metadata.
   *
   * Returns `hasMore` rather than pretending the list is complete: a 5,000-track playlist used to
   * page all the way in series before the player could start, and the caller had no way to know it
   * had been handed a partial view. Prefer `loadPlaylistTracks` when only the tracks are wanted.
   */
  async getPlaylistTracksPage(playlistId: string, options: { limit?: number } = {}): Promise<PlaylistTracksResult> {
    const limit = Math.max(1, Math.floor(options.limit ?? DEFAULT_TRACK_LIMIT));
    const key = this.cacheKey(`tracks:${playlistId}:${limit}`);
    const cached = this.readCache(this.tracksCache, key);
    if (cached) return cached;

    type PlaylistItemsResponse = { nextPageToken?: string; items?: Array<{ snippet: { title: string; channelTitle?: string; thumbnails?: { high?: { url: string }; medium?: { url: string } }; resourceId: { videoId: string } } }> };
    const items: NonNullable<PlaylistItemsResponse['items']> = [];
    let pageToken: string | undefined;
    let hasMore = false;

    for (let page = 0; page < MAX_TRACK_PAGES; page += 1) {
      const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const data = await this.authorized<PlaylistItemsResponse>(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50${token}`);
      items.push(...(data.items || []));
      pageToken = data.nextPageToken;
      // Stop as soon as the cap is covered. The remaining pages are not "missing" - they exist, and
      // `hasMore` says so.
      if (items.length >= limit) { hasMore = Boolean(pageToken); break; }
      if (!pageToken) break;
    }

    const selected = items.slice(0, limit);
    const baseTracks = selected.filter(item => item.snippet.resourceId?.videoId).map(item => ({
      id: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      artists: [{ id: item.snippet.channelTitle || 'youtube', name: item.snippet.channelTitle || 'YouTube Music' }],
      coverUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
      source: 'ytmusic' as const,
      audioUrl: item.snippet.resourceId.videoId,
    }));

    let metadata = new Map<string, YouTubeVideoMetadata>();
    try {
      metadata = await this.getVideoMetadata(baseTracks.map(track => track.id));
    } catch (error) {
      // Playlist items remain usable when the optional metadata request is unavailable.
      // The resulting `unknown` kind intentionally avoids treating an ordinary video as music.
      // It used to fail in total silence, which made "every track is unknown" impossible to explain
      // without a debugger; the reason is now reported instead of shown.
      this.onDiagnostic?.({
        name: 'youtube_metadata_unavailable',
        details: {
          playlistId,
          trackCount: baseTracks.length,
          reason: error instanceof Error ? error.name : 'unknown',
        },
      });
    }

    const result: PlaylistTracksResult = {
      tracks: baseTracks.map(track => {
        const video = metadata.get(track.id);
        return {
          ...track,
          durationMs: parseYouTubeDuration(video?.duration),
          youtubeVideoKind: resolveYouTubeVideoKind(video?.categoryId),
        };
      }),
      hasMore,
    };

    if (hasMore) {
      this.onDiagnostic?.({
        name: 'youtube_tracks_truncated',
        details: { playlistId, loaded: result.tracks.length, limit },
      });
    }

    this.writeCache(this.tracksCache, key, result, TRACKS_TTL_MS);
    return result;
  }

  /** The common case: the tracks, without the truncation flag. */
  async getPlaylistTracks(playlistId: string, options: { limit?: number } = {}): Promise<Song[]> {
    const { tracks } = await this.getPlaylistTracksPage(playlistId, options);
    return tracks;
  }

  // YouTube does not expose a public YouTube Music playback/account API.
  // Public search now goes through the serverless `/api/youtube/search` proxy so the
  // Data API key stays server-side instead of shipping inside the Vite bundle.
  async searchTracks(query: string): Promise<Song[]> {
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message = payload && typeof payload === 'object' && typeof (payload as { error?: string }).error === 'string'
          ? (payload as { error: string }).error
          : `YouTube 搜尋失敗：${res.status}`;
        throw new Error(message);
      }
      const data = await res.json();
      return (data.items || []).map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        artists: [{ id: item.snippet.channelId, name: item.snippet.channelTitle || 'YouTube Music' }],
        coverUrl: item.snippet.thumbnails?.high?.url || `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
        source: 'ytmusic' as const,
        youtubeVideoKind: 'music' as const,
        // IFrame Player requires the 11-character video ID, not a full watch URL.
        audioUrl: item.id.videoId,
      }));
    } catch (err) {
      console.warn('[YTMusic] Search error:', err);
      throw err;
    }
  }

  openInYouTubeMusic(videoId: string) {
    window.open(`https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`, '_blank', 'noopener,noreferrer');
  }
}
