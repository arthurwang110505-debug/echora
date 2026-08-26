import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '@echora/core';
import Settings from './Settings';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  currentSong: null as Song | null,
  currentLyrics: null as { lines: Array<{ fullText: string; words: Array<{ text: string }> }> } | null,
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../contexts/PlayerContext', () => ({
  usePlayer: () => ({ currentSong: mocks.currentSong, currentLyrics: mocks.currentLyrics }),
}));
vi.mock('../contexts/ThemeProvider', () => ({
  useTheme: () => ({
    currentTheme: { name: 'Midnight', backgroundColor: '#07090e', primaryColor: '#ffffff', accentColor: '#62f5c4', secondaryColor: '#6366f1' },
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
    enableAiTheme: vi.fn(),
    aiThemeEnabled: false,
    motionPreference: 'system',
    setMotionPreference: vi.fn(),
  }),
}));
describe('Settings AI stage experience', () => {
  it('asks the listener to choose a song before generating a stage', () => {
    mocks.currentSong = null;
    mocks.currentLyrics = null;

    const markup = renderToStaticMarkup(<Settings />);

    expect(markup).toContain('為這首歌生成舞台');
    expect(markup).toContain('先播放一首歌，再來設計它的舞台');
    expect(markup).toContain('選一首展示曲目');
    expect(markup).not.toContain('本機診斷紀錄');
  });

  it('shows the currently playing song as the stage-generation context', () => {
    mocks.currentSong = {
      id: 'demo-stage',
      title: 'Night Signals',
      artists: [{ id: 'echora', name: 'Echora Sessions' }],
      source: 'local',
    };
    mocks.currentLyrics = { lines: [{ fullText: 'The night is alive', words: [] }] };

    const markup = renderToStaticMarkup(<Settings />);

    expect(markup).toContain('正在設計');
    expect(markup).toContain('Night Signals');
    expect(markup).toContain('會參考目前可用的歌詞與歌曲氛圍');
    expect(markup).toContain('生成 AI 舞台預覽');
    expect(markup).not.toContain('Agnes');
    expect(markup).not.toContain('本機診斷紀錄');
    expect(markup).toContain('v0.1.0');
  });
});
