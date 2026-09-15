import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Library from './Library';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  player: {
    activeSource: 'local',
    setActiveSource: vi.fn(),
    youtubeConnected: false,
    youtubeConnectionState: 'idle',
    youtubeProfile: null as { name: string } | null,
    userPlaylists: [],
    favoriteSongs: [],
    isSyncingLibrary: false,
    libraryError: null,
    lastLibrarySyncAt: null,
    loadSourcePlaylists: vi.fn(),
    loadYouTubePlaylist: vi.fn(),
    play: vi.fn(),
    switchYouTubeAccount: vi.fn(),
    disconnectYouTube: vi.fn(),
    toggleFavoriteSong: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('../contexts/PlayerContext', () => ({
  usePlayer: () => mocks.player,
}));

describe('Library mobile hierarchy', () => {
  it('keeps connection and showcase actions without rendering recent listening', () => {
    const markup = renderToStaticMarkup(<Library />);

    expect(markup).toContain('連接我的音樂');
    expect(markup).toContain('本機展示，不需先連線');
    expect(markup).toContain('已連線歌單');
    expect(markup).not.toContain('Connected playlists');
    expect(markup).not.toContain('Device showcase');
    expect(markup).not.toContain('最近播放');
    expect(markup).not.toContain('Continue listening');
  });

  it('shows explicit YouTube account switch and logout controls when connected', () => {
    const originalPlayer = mocks.player;
    mocks.player = {
      ...originalPlayer,
      activeSource: 'ytmusic',
      youtubeConnected: true,
      youtubeConnectionState: 'connected',
      youtubeProfile: { name: '一般' },
    };

    const markup = renderToStaticMarkup(<Library />);

    expect(markup).toContain('切換帳號');
    expect(markup).toContain('登出 YouTube');
    expect(markup).toContain('一般');
    mocks.player = originalPlayer;
  });
});
