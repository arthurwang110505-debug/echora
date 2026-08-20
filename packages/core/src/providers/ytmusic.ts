// YouTube Music Provider for Echora
import type { Song } from '../types';
import type { Playlist } from './types';

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

export interface YTTrack {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  thumbnailUrl?: string;
  durationMs?: number;
}

export interface YouTubeProfile { name: string; avatarUrl?: string; channelId?: string; }

export class YouTubeMusicProvider {
  private accessToken: string | null = null;

  setAccessToken(token: string | null) { this.accessToken = token; }

  private async authorized<T>(url: string): Promise<T> {
    if (!this.accessToken) throw new Error('YouTube 尚未登入');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!response.ok) throw new Error(`YouTube API failed: ${response.status}`);
    return response.json() as Promise<T>;
  }

  async getUserPlaylists(): Promise<Playlist[]> {
    type PlaylistResponse = { nextPageToken?: string; items?: Array<{ id: string; snippet: { title: string; thumbnails?: { medium?: { url: string } } }; contentDetails?: { itemCount: number } }> };
    const items: NonNullable<PlaylistResponse['items']> = [];
    let pageToken: string | undefined;

    for (let page = 0; page < 4; page += 1) {
      const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const data = await this.authorized<PlaylistResponse>(`https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50${token}`);
      items.push(...(data.items || []));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    return items.map(item => ({ id: item.id, name: item.snippet.title, coverUrl: item.snippet.thumbnails?.medium?.url, trackCount: item.contentDetails?.itemCount, source: 'ytmusic' as const }));
  }

  async getProfile(): Promise<YouTubeProfile | null> {
    const data = await this.authorized<{ items?: Array<{ id: string; snippet?: { title?: string; thumbnails?: { default?: { url: string } } } }> }>('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true');
    const item = data.items?.[0];
    return item ? { channelId: item.id, name: item.snippet?.title || 'YouTube Music', avatarUrl: item.snippet?.thumbnails?.default?.url } : null;
  }

  async getPlaylistTracks(playlistId: string): Promise<Song[]> {
    type PlaylistItemsResponse = { nextPageToken?: string; items?: Array<{ snippet: { title: string; channelTitle?: string; thumbnails?: { high?: { url: string }; medium?: { url: string } }; resourceId: { videoId: string } } }> };
    const items: NonNullable<PlaylistItemsResponse['items']> = [];
    let pageToken: string | undefined;

    for (let page = 0; page < 4; page += 1) {
      const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const data = await this.authorized<PlaylistItemsResponse>(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50${token}`);
      items.push(...(data.items || []));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    return items.filter(item => item.snippet.resourceId?.videoId).map(item => ({
      id: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      artists: [{ id: item.snippet.channelTitle || 'youtube', name: item.snippet.channelTitle || 'YouTube Music' }],
      coverUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
      source: 'ytmusic' as const,
      audioUrl: item.snippet.resourceId.videoId,
    }));
  }
  // YouTube does not expose a public YouTube Music playback/account API.
  // Use the official YouTube Data API for public search, then hand playback to YouTube Music.
  async searchTracks(query: string): Promise<Song[]> {
    try {
      const apiKey = (import.meta as any).env?.VITE_YOUTUBE_API_KEY as string | undefined;
      if (!apiKey) throw new Error('尚未設定 YouTube 搜尋 API，請改從已同步的私人歌單選取曲目。');
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=20&q=${encodeURIComponent(query)}&key=${apiKey}`);
      if (!res.ok) throw new Error(`YouTube 搜尋失敗：${res.status}`);
      const data = await res.json();
      return (data.items || []).map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        artists: [{ id: item.snippet.channelId, name: item.snippet.channelTitle || 'YouTube Music' }],
        coverUrl: item.snippet.thumbnails?.high?.url || `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
        source: 'ytmusic' as const,
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

  // Get Popular YT Music Playlists
  async getFeaturedPlaylists(): Promise<Playlist[]> {
    return [];
  }

}
