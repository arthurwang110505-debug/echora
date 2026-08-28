import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AppHome from './AppHome';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  location: { pathname: '/app', search: '', hash: '' },
  player: {
    currentSong: null,
    play: vi.fn(),
    setPlaylist: vi.fn(),
    playlist: [],
    selectedPlaylistId: null,
    loadedPlaylistId: null,
    recentSongs: [] as Array<Record<string, unknown>>,
    activeSource: 'local',
    setActiveSource: vi.fn(),
    spotifyConnected: false,
    spotifyError: null,
    connectSpotify: vi.fn(),
    disconnectSpotify: vi.fn(),
    youtubeConnected: false,
    youtubeError: null,
    youtubeConnectionState: 'idle',
    youtubeProfile: null,
    userPlaylists: [],
    isSyncingLibrary: false,
    libraryError: null,
    lastLibrarySyncAt: null,
    loadSourcePlaylists: vi.fn(),
    connectYouTube: vi.fn(),
    switchYouTubeAccount: vi.fn(),
    disconnectYouTube: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => mocks.location,
}));

vi.mock('../contexts/PlayerContext', () => ({
  usePlayer: () => mocks.player,
}));

describe('AppHome (the /app shell)', () => {
  it('keeps a 44px Library entry when the desktop nav is hidden below md', () => {
    const markup = renderToStaticMarkup(<AppHome />);

    expect(markup).toContain('aria-label="我的音樂庫"');
    expect(markup).toContain('md:hidden');
    expect(markup).toContain('h-11 w-11');
  });

  it('renders loaded connected YouTube playlist context instead of the demo catalog', () => {
    Object.assign(mocks.player, {
      activeSource: 'ytmusic',
      youtubeConnected: true,
      youtubeConnectionState: 'synced',
      selectedPlaylistId: 'playlist-1',
      loadedPlaylistId: 'playlist-1',
      userPlaylists: [{ id: 'playlist-1', name: '我的夜間歌單', source: 'ytmusic', trackCount: 1 }],
      playlist: [{
        id: 'user-video-1',
        title: '我的真實歌曲',
        artists: [{ id: 'channel-1', name: '我的頻道' }],
        source: 'ytmusic',
        audioUrl: 'user-video-1',
        youtubeVideoKind: 'music',
      }],
    });

    const markup = renderToStaticMarkup(<AppHome />);

    // The playback console names the loaded playlist (the tracks themselves
    // render inside the lazy 3D carousel, not the static shell markup).
    expect(markup).toContain('你的歌單 · 我的夜間歌單');
    expect(markup).toContain('目前顯示「我的夜間歌單」');
    expect(markup).not.toContain('YouTube Music 示範歌曲');
  });

  it('offers to resume the most recently played local demo song', () => {
    Object.assign(mocks.player, {
      activeSource: 'local',
      youtubeConnected: false,
      youtubeConnectionState: 'idle',
      selectedPlaylistId: null,
      loadedPlaylistId: null,
      userPlaylists: [],
      playlist: [],
      recentSongs: [{
        id: 'demo-dancing-in-the-stardust',
        title: 'Dancing in the Stardust',
        artists: [{ id: 'demo', name: 'Echora 展示' }],
        source: 'local',
      }],
    });

    const markup = renderToStaticMarkup(<AppHome />);

    expect(markup).toContain('繼續上次的展示曲目');
  });
});
