import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Library from './Library';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('../contexts/PlayerContext', () => ({
  usePlayer: () => ({
    activeSource: 'local',
    setActiveSource: vi.fn(),
    youtubeConnected: false,
    youtubeConnectionState: 'idle',
    youtubeProfile: null,
    userPlaylists: [],
    favoriteSongs: [],
    isSyncingLibrary: false,
    libraryError: null,
    lastLibrarySyncAt: null,
    loadSourcePlaylists: vi.fn(),
    loadYouTubePlaylist: vi.fn(),
    play: vi.fn(),
    toggleFavoriteSong: vi.fn(),
  }),
}));

describe('Library mobile hierarchy', () => {
  it('keeps connection and showcase actions without rendering recent listening', () => {
    const markup = renderToStaticMarkup(<Library />);

    expect(markup).toContain('連接我的音樂');
    expect(markup).toContain('本機展示，不需先連線');
    expect(markup).not.toContain('最近播放');
    expect(markup).not.toContain('Continue listening');
  });
});
