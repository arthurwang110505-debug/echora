// YouTube Music Provider for Echora
import type { Song } from '../types';
import type { Playlist } from './types';

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
    const data = await this.authorized<{ items?: Array<{ id: string; snippet: { title: string; thumbnails?: { medium?: { url: string } } }; contentDetails?: { itemCount: number } }> }>('https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50');
    return (data.items || []).map(item => ({ id: item.id, name: item.snippet.title, coverUrl: item.snippet.thumbnails?.medium?.url, trackCount: item.contentDetails?.itemCount, source: 'ytmusic' as const }));
  }

  async getProfile(): Promise<YouTubeProfile | null> {
    const data = await this.authorized<{ items?: Array<{ id: string; snippet?: { title?: string; thumbnails?: { default?: { url: string } } } }> }>('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true');
    const item = data.items?.[0];
    return item ? { channelId: item.id, name: item.snippet?.title || 'YouTube Music', avatarUrl: item.snippet?.thumbnails?.default?.url } : null;
  }

  async getPlaylistTracks(playlistId: string): Promise<Song[]> {
    const data = await this.authorized<{ items?: Array<{ snippet: { title: string; channelTitle?: string; thumbnails?: { high?: { url: string }; medium?: { url: string } }; resourceId: { videoId: string } } }> }>(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50`);
    return (data.items || []).filter(item => item.snippet.resourceId?.videoId).map(item => ({
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
      if (!apiKey) return this.getMockYTTracks(query);
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=20&q=${encodeURIComponent(query)}&key=${apiKey}`);
      if (!res.ok) return this.getMockYTTracks(query);
      const data = await res.json();
      return (data.items || []).map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        artists: [{ id: item.snippet.channelId, name: item.snippet.channelTitle || 'YouTube Music' }],
        coverUrl: item.snippet.thumbnails?.high?.url || `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
        source: 'ytmusic' as const,
        audioUrl: `https://music.youtube.com/watch?v=${item.id.videoId}`,
      }));
    } catch (err) {
      console.warn('[YTMusic] Search error:', err);
      return this.getMockYTTracks(query);
    }
  }

  openInYouTubeMusic(videoId: string) {
    window.open(`https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`, '_blank', 'noopener,noreferrer');
  }

  // Get Popular YT Music Playlists
  async getFeaturedPlaylists(): Promise<Playlist[]> {
    return [
      {
        id: 'RDCLAK5uy_kL8wQ9d20c5_yytm1',
        name: '🔥 YouTube Music Top Hits 2026',
        coverUrl: 'https://picsum.photos/seed/yttop/400/400',
        trackCount: 50,
        source: 'ytmusic',
      },
      {
        id: 'RDCLAK5uy_l0r8z5y4u9i0',
        name: '🎧 Chill & Lo-Fi Beats',
        coverUrl: 'https://picsum.photos/seed/ytchill/400/400',
        trackCount: 30,
        source: 'ytmusic',
      },
    ];
  }

  private getMockYTTracks(query: string): Song[] {
    return [
      {
        id: 'yt_mock_1',
        title: `${query} (YouTube Music Remaster)`,
        artists: [{ id: 'yt1', name: 'YT Music Artist' }],
        album: { id: 'alb1', name: 'YouTube Trending' },
        durationMs: 215000,
        coverUrl: 'https://picsum.photos/seed/yt1/300/300',
        source: 'ytmusic',
      },
    ];
  }
}
