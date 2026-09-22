// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '@echora/core';
import i18n from '../i18n';
import Player from './Player';
import { usePlayerStore } from '../store/playerStore';
import { useStageStore } from '../store/stageStore';

// The heavy stage surfaces need WebGL/Web Audio that jsdom does not have; they are irrelevant
// to the chrome under test, so they are stubbed. Everything else on the page is the real thing.
vi.mock('../components/OriginalFoliaVisualizerStage', () => ({ default: () => <div data-testid="stage-stub" /> }));
vi.mock('../components/OriginalFoliaTuningPanel', () => ({ default: () => <div data-testid="tuning-stub" /> }));
vi.mock('../components/LyriclessSoundscapeStage', () => ({ default: () => <div data-testid="soundscape-stub" /> }));
vi.mock('../components/YouTubePlayer', () => ({ default: () => <div data-testid="youtube-stub" /> }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate, useLocation: () => mocks.location };
});

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  location: { pathname: '/player', search: '', hash: '', state: null },
}));

const t = (key: string) => i18n.t(key);

const song = (id: string, title: string): Song => ({
  id,
  title,
  artists: [{ id: `artist-${id}`, name: `Artist ${id}` }],
  album: { id: `album-${id}`, name: `Album ${id}` },
  source: 'local',
  coverUrl: '',
  audioUrl: `https://cdn.jsdelivr.net/gh/o/r@main/${id}.mp3`,
});

const QUEUE = [song('1', '第一首'), song('2', '第二首'), song('3', '第三首')];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const mount = async () => {
  host = document.createElement('div');
  document.body.append(host);
  await act(async () => {
    root = createRoot(host as HTMLDivElement);
    root.render(<StrictMode><Player /></StrictMode>);
  });
  await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 0)); });
};

const press = async (init: KeyboardEventInit & { code?: string }) => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
};

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

const byLabel = (label: string) => (
  Array.from(document.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === label)
);

const panelSurface = () => document.querySelector('[data-testid="unified-panel-surface"]');

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  mocks.navigate.mockClear();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ configured: false }) })));
  usePlayerStore.setState({
    currentSong: QUEUE[0],
    playlist: QUEUE,
    currentIndex: 0,
    isPlaying: false,
    currentTime: 10,
    duration: 200,
    displayMode: 'full',
    currentLyrics: null,
    isLoadingLyrics: false,
    lyricsStatus: 'unavailable',
  });
  useStageStore.setState({ transparentBackground: false, autoVisualizer: false });
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  host?.remove();
  host = null;
  vi.unstubAllGlobals();
});

describe('Player page — 播放頁面 chrome', () => {
  it('labels the stage entry point 全螢幕', async () => {
    await mount();
    const button = byLabel(t('player.enterFullscreenAria'));
    expect(button?.textContent).toBe('全螢幕');
  });

  it('opens the floating panel from the bottom-right button, with the five guide tabs', async () => {
    await mount();
    expect(panelSurface()).toBeNull();

    await click(byLabel(t('panel.toggleAria')) as Element);
    expect(panelSurface()).toBeTruthy();
    expect(Array.from(document.querySelectorAll('[role="tab"]')).map(tab => tab.getAttribute('aria-label'))).toEqual([
      t('panel.tabCover'),
      t('panel.tabLyrics'),
      t('panel.tabControls'),
      t('panel.tabQueue'),
      t('panel.tabAccount'),
    ]);
  });

  it('toggles the panel with P, as the guide specifies', async () => {
    await mount();
    await press({ key: 'p' });
    expect(panelSurface()).toBeTruthy();
    await press({ key: 'p' });
    expect(panelSurface()).toBeNull();
  });

  it('hides the progress bar and the bottom-right button with H, and brings them back', async () => {
    await mount();
    expect(byLabel(t('player.enterFullscreenAria'))).toBeTruthy();
    expect(byLabel(t('panel.toggleAria'))).toBeTruthy();

    await press({ key: 'h' });
    expect(byLabel(t('player.enterFullscreenAria'))).toBeUndefined();
    expect(byLabel(t('panel.toggleAria'))).toBeUndefined();
    expect(host?.textContent).toContain(t('panel.chromeHiddenHint'));

    await press({ key: 'h' });
    expect(byLabel(t('player.enterFullscreenAria'))).toBeTruthy();
  });

  it('opens the command palette with Ctrl+K and lists commands', async () => {
    await mount();
    await press({ key: 'k', ctrlKey: true });
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-label')).toBe(t('panel.commands.ariaLabel'));
    expect(host?.textContent).toContain(t('panel.commands.playPause'));
  });

  it('seeks five seconds with the bare arrow keys', async () => {
    await mount();
    // Assert the store effect rather than spying on `seek`: the page destructures the action
    // at render time, so a spy installed afterwards would never observe the call.
    expect(usePlayerStore.getState().currentTime).toBe(10);
    await press({ key: 'ArrowRight' });
    expect(usePlayerStore.getState().currentTime).toBe(15);
    await press({ key: 'ArrowLeft' });
    expect(usePlayerStore.getState().currentTime).toBe(10);
  });

  it('clamps a backward seek at zero', async () => {
    usePlayerStore.setState({ currentTime: 2 });
    await mount();
    await press({ key: 'ArrowLeft' });
    expect(usePlayerStore.getState().currentTime).toBe(0);
  });

  it('reorders the queue from the panel and keeps the store index in sync', async () => {
    await mount();
    await press({ key: 'p' });
    await click(Array.from(document.querySelectorAll('[role="tab"]'))[3] as Element);

    await click(byLabel(t('panel.moveToEnd')) as Element);
    expect(usePlayerStore.getState().playlist.map(item => item.title)).toEqual(['第二首', '第三首', '第一首']);
    // The highlight follows the playing song to its new slot.
    expect(usePlayerStore.getState().playlist[usePlayerStore.getState().currentIndex].title).toBe('第一首');
  });

  it('removes a queue row from the panel', async () => {
    await mount();
    await press({ key: 'p' });
    await click(Array.from(document.querySelectorAll('[role="tab"]'))[3] as Element);

    await click(byLabel(t('panel.remove')) as Element);
    expect(usePlayerStore.getState().playlist.map(item => item.title)).toEqual(['第二首', '第三首']);
  });

  it('cycles the loop mode from the 播放控制 tab', async () => {
    usePlayerStore.setState({ loopMode: 'off' });
    await mount();
    await press({ key: 'p' });
    await click(Array.from(document.querySelectorAll('[role="tab"]'))[2] as Element);

    await click(byLabel(t('panel.loopOff')) as Element);
    expect(usePlayerStore.getState().loopMode).toBe('list');
  });

  it('returns home from the top-left hover hotspot', async () => {
    await mount();
    await click(byLabel(t('panel.backHotspot')) as Element);
    expect(mocks.navigate).toHaveBeenCalledWith('/app');
  });

  it('hides the backdrop when the transparent-background cover button is toggled', async () => {
    await mount();
    await press({ key: 'p' });
    expect(useStageStore.getState().transparentBackground).toBe(false);
    await click(byLabel(t('panel.transparentBackground')) as Element);
    expect(useStageStore.getState().transparentBackground).toBe(true);
  });

  it('shows the volume row in the normal player panel', async () => {
    await mount();
    await press({ key: 'p' });
    await click(Array.from(document.querySelectorAll('[role="tab"]'))[2] as Element);
    expect(document.querySelector('[data-testid="volume-control"]')).toBeTruthy();
  });
});

describe('Player page — 全螢幕 chrome', () => {
  const enterStage = async () => {
    usePlayerStore.setState({ displayMode: 'stage' });
    await mount();
  };

  it('keeps 退出全螢幕 as the only pinned control besides transport', async () => {
    await enterStage();
    expect(byLabel(t('panel.exitFullscreen'))).toBeTruthy();
    // The old stage bar's 歌單 and 設定 buttons are gone.
    expect(byLabel(t('player.backToPlaylistAria'))).toBeUndefined();
    expect(byLabel(t('player.openStageSettings'))).toBeUndefined();
  });

  it('puts transport, panel toggle and 退出全螢幕 in one single row', async () => {
    await enterStage();
    // One shared container for the whole stage control strip — nothing floats on top.
    const rows = Array.from(document.querySelectorAll('[role="group"]'));
    expect(rows).toHaveLength(1);
    const row = rows[0] as Element;
    expect(row.getAttribute('aria-label')).toBe(t('player.immersiveControls'));
    for (const label of [t('player.prev'), t('player.playAudio'), t('player.next'), t('panel.paletteHint'), t('panel.toggleAria'), t('panel.exitFullscreen')]) {
      expect(row.contains(byLabel(label) as Element), `${label} must sit inside the single row`).toBe(true);
    }
    // Order: transport, then the panel buttons, then 退出全螢幕 last.
    const labels = Array.from(row.querySelectorAll('button[aria-label]'))
      .map(button => button.getAttribute('aria-label'));
    expect(labels).toEqual([
      t('player.prev'),
      t('player.playAudio'),
      t('player.next'),
      t('panel.paletteHint'),
      t('panel.toggleAria'),
      t('panel.exitFullscreen'),
    ]);
    // No separate floating bar may exist alongside it.
    expect(document.querySelectorAll('[role="group"]').length).toBe(1);
  });

  it('opens the same floating panel inside the stage', async () => {
    await enterStage();
    expect(panelSurface()).toBeNull();
    await press({ key: 'p' });
    expect(panelSurface()).toBeTruthy();
    expect(Array.from(document.querySelectorAll('[role="tab"]')).map(tab => tab.getAttribute('aria-label'))).toEqual([
      t('panel.tabCover'),
      t('panel.tabLyrics'),
      t('panel.tabControls'),
      t('panel.tabQueue'),
      t('panel.tabAccount'),
    ]);
  });

  it('gives the stage panel no volume widget — the stage keeps volume keyboard-only', async () => {
    await enterStage();
    await press({ key: 'p' });
    await click(Array.from(document.querySelectorAll('[role="tab"]'))[2] as Element);
    expect(document.querySelector('[data-testid="volume-control"]')).toBeNull();
    // The rest of the 播放控制 tab is still there.
    expect(byLabel(t('panel.loopList'))).toBeTruthy();
    expect(byLabel(t('panel.generateAiTheme'))).toBeTruthy();
  });

  it('still carries the stage settings that used to live in the 設定 popover', async () => {
    await enterStage();
    await press({ key: 'p' });
    await click(Array.from(document.querySelectorAll('[role="tab"]'))[2] as Element);
    // 歌詞動畫 / 背景效果 steppers replaced the two <select> pickers.
    expect(byLabel(t('panel.lyricsAnimation'))).toBeTruthy();
    expect(byLabel(t('panel.backgroundEffect'))).toBeTruthy();
    // 歌詞時間軸 moved to the 歌詞資訊 tab.
    await click(Array.from(document.querySelectorAll('[role="tab"]'))[1] as Element);
    expect(host?.textContent).toContain(t('panel.matchOnline'));
  });

  it('hides the panel and the exit bar with H', async () => {
    await enterStage();
    await press({ key: 'h' });
    expect(byLabel(t('panel.toggleAria'))).toBeUndefined();
    expect(byLabel(t('panel.exitFullscreen'))).toBeUndefined();
  });
});
