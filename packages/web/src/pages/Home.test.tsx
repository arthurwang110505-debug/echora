import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Home from './Home';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  player: {
    currentSong: null,
    play: vi.fn(),
    setPlaylist: vi.fn(),
    playlist: [],
    selectedPlaylistId: null,
    loadedPlaylistId: null,
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
  useLocation: () => ({ pathname: '/', search: '', hash: '' }),
}));

vi.mock('../contexts/PlayerContext', () => ({
  usePlayer: () => mocks.player,
}));

describe('Home mobile navigation', () => {
  it('keeps a 44px Library entry when the desktop nav is hidden below md', () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain('aria-label="我的音樂庫"');
    expect(markup).toContain('md:hidden');
    expect(markup).toContain('h-11 w-11');
  });

  it('renders loaded connected YouTube playlist tracks instead of the demo catalog', () => {
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

    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain('我的真實歌曲');
    expect(markup).toContain('你的歌單 · 我的夜間歌單');
    expect(markup).not.toContain('YouTube Music 示範歌曲');
  });

});
