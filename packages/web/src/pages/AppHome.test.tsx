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
    spotifySearchResults: [] as Array<Record<string, unknown>>,
    spotifySearchQuery: '',
    spotifySearching: false,
    searchSpotifySongs: vi.fn(),
    importSpotifyPlaylistLink: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => mocks.location,
}));

vi.mock('../contexts/PlayerContext', () => ({
  usePlayer: () => mocks.player,
}));

// The Spotify source only renders once a Client ID exists (see `spotifyAvailable`).
vi.mock('../store/spotifyCredentialStore', async () => {
  const actual = await vi.importActual<typeof import('../store/spotifyCredentialStore')>('../store/spotifyCredentialStore');
  return {
    ...actual,
    useSpotifyCredentialStore: Object.assign(
      (selector?: (state: { clientId: string }) => unknown) => selector
        ? selector({ clientId: 'testclientid0123456789abcdefgh' })
        : { clientId: 'testclientid0123456789abcdefgh' },
      { getState: () => ({ clientId: 'testclientid0123456789abcdefgh' }) },
    ),
  };
});

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

describe('AppHome Spotify search and playlist links', () => {
  const spotifyHome = (overrides: Record<string, unknown>) => {
    Object.assign(mocks.player, {
      activeSource: 'spotify',
      spotifyConnected: true,
      spotifySearchResults: [],
      spotifySearchQuery: '',
      spotifySearching: false,
      playlist: [],
    }, overrides);
    return renderToStaticMarkup(<AppHome />);
  };

  it('shows the playlist-link box on the Spotify source', () => {
    const markup = spotifyHome({ playlist: [] });

    expect(markup).toContain('貼上 Spotify 歌單連結');
    expect(markup).toContain('https://open.spotify.com/playlist/…');
  });

  it('does not show the playlist-link box on the local source', () => {
    const markup = spotifyHome({ activeSource: 'local' });

    expect(markup).not.toContain('貼上 Spotify 歌單連結');
  });

  it('renders real search results and labels them as such', () => {
    // The default 3D carousel is lazy, so the server-rendered markup is only a skeleton and the
    // rows never appear. Asserting the label and the count is asserting what this markup can say.
    const markup = spotifyHome({
      spotifySearchQuery: 'night',
      spotifySearchResults: [{
        id: 'sp-1',
        title: 'Night Signals',
        artists: [{ id: 'a', name: 'Echora Sessions' }],
        source: 'spotify',
        audioUrl: 'spotify:track:sp-1',
      }],
    });

    expect(markup).toContain('Spotify 搜尋結果');
    // One row, echoed in the count beside the label.
    expect(markup).toContain('>01<');
    expect(markup).toContain('搜尋 Spotify 歌曲');
  });

  it('asks for a connection in a banner, without hiding the demo rows', () => {
    const markup = spotifyHome({ spotifyConnected: false });

    expect(markup).toContain('連接 Spotify 後就能搜尋整個目錄。');
    // An unconnected page still shows the demo catalogue; "no results" would be a lie.
    expect(markup).not.toContain('沒有找到歌曲');
  });

  it('explains an empty result set rather than showing the demo catalogue', () => {
    const markup = spotifyHome({ spotifySearchQuery: 'zzzz', spotifySearchResults: [] });

    expect(markup).toContain('沒有找到歌曲');
    expect(markup).not.toContain('夜に駆ける');
  });
});
