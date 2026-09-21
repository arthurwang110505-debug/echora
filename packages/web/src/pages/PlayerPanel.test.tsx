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
});
