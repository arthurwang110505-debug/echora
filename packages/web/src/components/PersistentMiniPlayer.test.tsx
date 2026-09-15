import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '@echora/core';
import PersistentMiniPlayer from './PersistentMiniPlayer';

const mocks = vi.hoisted(() => ({
  currentSong: null as Song | null,
  isPlaying: false,
  favoriteSongs: [] as Song[],
  pathname: '/',
  navigate: vi.fn(),
  playPause: vi.fn(),
  pause: vi.fn(),
  toggleFavoriteSong: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mocks.pathname }),
  useNavigate: () => mocks.navigate,
}));
vi.mock('../contexts/PlayerContext', () => ({
  usePlayer: () => ({
    currentSong: mocks.currentSong,
    isPlaying: mocks.isPlaying,
    favoriteSongs: mocks.favoriteSongs,
    playPause: mocks.playPause,
    toggleFavoriteSong: mocks.toggleFavoriteSong,
  }),
}));

describe('PersistentMiniPlayer', () => {
  const song: Song = {
    id: 'demo-mini-player',
    title: 'Dancing in the Stardust',
    artists: [{ id: 'freesoundserver', name: 'Free Sound Server' }],
    source: 'local',
    coverUrl: '/covers/dancing-in-the-stardust.webp',
  };

  it('stays hidden until a track has been selected', () => {
    mocks.currentSong = null;
    mocks.pathname = '/';

    expect(renderToStaticMarkup(<PersistentMiniPlayer />)).toBe('');
  });

  it('renders persistent song details, favorite control, and pause control while playing', () => {
    mocks.currentSong = song;
    mocks.isPlaying = true;
    mocks.favoriteSongs = [song];
    mocks.pathname = '/library';

    const markup = renderToStaticMarkup(<PersistentMiniPlayer />);

    expect(markup).toContain('目前播放');
    expect(markup).toContain('Dancing in the Stardust');
    expect(markup).toContain('Free Sound Server');
    expect(markup).toContain('取消收藏 Dancing in the Stardust');
    expect(markup).toContain('暫停播放');
    expect(markup).toContain('safe-area-inset-bottom');
  });

  it('does not overlap the full player route', () => {
    mocks.currentSong = song;
    mocks.isPlaying = false;
    mocks.favoriteSongs = [];
    mocks.pathname = '/player';

    expect(renderToStaticMarkup(<PersistentMiniPlayer />)).toBe('');
  });

  it('stays hidden while Settings is open', () => {
    mocks.currentSong = song;
    mocks.isPlaying = true;
    mocks.pathname = '/settings';

    expect(renderToStaticMarkup(<PersistentMiniPlayer />)).toBe('');
  });
});
