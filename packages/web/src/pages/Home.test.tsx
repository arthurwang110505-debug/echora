import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Home from './Home';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: '/', search: '', hash: '' }),
}));

vi.mock('../contexts/PlayerContext', () => ({
  usePlayer: () => ({
    currentSong: null,
    play: vi.fn(),
    setPlaylist: vi.fn(),
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
    disconnectYouTube: vi.fn(),
  }),
}));

describe('Home mobile navigation', () => {
  it('keeps a 44px Library entry when the desktop nav is hidden below md', () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain('aria-label="我的音樂庫"');
    expect(markup).toContain('md:hidden');
    expect(markup).toContain('h-11 w-11');
  });
});
