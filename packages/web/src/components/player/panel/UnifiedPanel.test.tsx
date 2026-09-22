// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '@echora/core';
import i18n from '../../../i18n';
import UnifiedPanel, { type PanelTab } from './UnifiedPanel';
import type { AccountTabProps } from './AccountTab';
import type { ControlsTabProps } from './ControlsTab';
import type { LyricsTabProps } from './LyricsTab';
import type { QueueTabProps } from './QueueTab';

const t = (key: string) => i18n.t(key);

const song = (id: string, title: string): Song => ({
  id,
  title,
  artists: [{ id: `artist-${id}`, name: `Artist ${id}` }],
  album: { id: `album-${id}`, name: `Album ${id}` },
  source: 'local',
  coverUrl: '',
});

const QUEUE = [song('1', '第一首'), song('2', '第二首'), song('3', '第三首')];

const makeLyrics = (overrides: Partial<LyricsTabProps> = {}): LyricsTabProps => ({
  isMatching: false,
  statusTitle: '已找到歌詞',
  statusCopy: '来源：LRCLIB',
  lyricsOffsetSeconds: 0,
  lyricsOffsetLabel: '已同步',
  onMatchOnline: vi.fn(),
  onImportLyrics: vi.fn(() => true),
  onAdjustOffset: vi.fn(),
  onResetOffset: vi.fn(),
  ...overrides,
});

const makeControls = (overrides: Partial<ControlsTabProps> = {}): ControlsTabProps => ({
  loopMode: 'list',
  onToggleLoop: vi.fn(),
  isLiked: false,
  onToggleLike: vi.fn(),
  aiThemeState: 'idle',
  hasSongAiTheme: false,
  canGenerateAiTheme: true,
  onGenerateAiTheme: vi.fn(),
  themeName: 'Default Dark',
  onOpenThemeQuickEditor: vi.fn(),
  isDaylight: false,
  onToggleDaylight: vi.fn(),
  activeVisualizer: 'classic',
  onVisualizerChange: vi.fn(),
  autoVisualizer: false,
  onAutoVisualizerChange: vi.fn(),
  backgroundMode: 'latent',
  onBackgroundModeChange: vi.fn(),
  onOpenFullTuning: vi.fn(),
  ...overrides,
});

const makeAccount = (overrides: Partial<AccountTabProps> = {}): AccountTabProps => ({
  activeSource: 'local',
  youtubeConnected: false,
  youtubeProfile: null,
  spotifyConnected: false,
  spotifyAvailable: false,
  favoriteCount: 3,
  recentCount: 5,
  onSetActiveSource: vi.fn(),
  onConnectYouTube: vi.fn(),
  onSwitchYouTube: vi.fn(),
  onDisconnectYouTube: vi.fn(),
  onConnectSpotify: vi.fn(),
  onDisconnectSpotify: vi.fn(),
  onOpenSettings: vi.fn(),
  ...overrides,
});

const makeQueue = (overrides: Partial<QueueTabProps> = {}): QueueTabProps => ({
  playlist: QUEUE,
  currentIndex: 0,
  isPlaying: true,
  shouldScrollToCurrent: false,
  onPlaySong: vi.fn(),
  onShuffle: vi.fn(),
  onMoveToNext: vi.fn(),
  onMoveToEnd: vi.fn(),
  onRemove: vi.fn(),
  ...overrides,
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const render = async (props: Partial<Parameters<typeof UnifiedPanel>[0]> = {}) => {
  const defaultProps = {
    isOpen: true,
    activeTab: 'cover' as PanelTab,
    onTabChange: vi.fn(),
    onClose: vi.fn(),
    song: QUEUE[0],
    isLiked: false,
    onToggleLike: vi.fn(),
    transparentBackground: false,
    onToggleTransparentBackground: vi.fn(),
    onOpenSettings: vi.fn(),
    onBackHome: vi.fn(),
    lyrics: makeLyrics(),
    controls: makeControls(),
    queue: makeQueue(),
    account: makeAccount(),
    themeQuickEditorTheme: null,
    onCloseThemeQuickEditor: vi.fn(),
    onSaveTheme: vi.fn(),
  };
  const merged = { ...defaultProps, ...props };
  host = document.createElement('div');
  document.body.append(host);
  await act(async () => {
    root = createRoot(host as HTMLDivElement);
    root.render(<UnifiedPanel {...merged} />);
  });
  return merged;
};

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

const buttonByLabel = (label: string) => (
  Array.from(document.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === label)
);

/** For buttons whose only label is their visible text (the account tab's actions). */
const buttonByText = (label: string) => (
  Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === label)
);

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  // jsdom has no layout engine, so keep the auto-scroll from throwing on a missing rect.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  host?.remove();
  host = null;
});

describe('UnifiedPanel', () => {
  it('renders nothing while collapsed', async () => {
    await render({ isOpen: false });
    expect(document.querySelector('[data-testid="unified-panel-surface"]')).toBeNull();
  });

  it('lists the five tabs from the guide, left to right', async () => {
    await render();
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    expect(tabs.map(tab => tab.getAttribute('aria-label'))).toEqual([
      t('panel.tabCover'),
      t('panel.tabLyrics'),
      t('panel.tabControls'),
      t('panel.tabQueue'),
      t('panel.tabAccount'),
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('shows song title, artist and album on the 歌曲資訊 tab', async () => {
    await render();
    const text = host?.textContent || '';
    expect(text).toContain('第一首');
    expect(text).toContain('Artist 1');
    expect(text).toContain('Album 1');
  });

  it('offers the four cover corner actions', async () => {
    await render();
    for (const label of [
      t('panel.openSettings'),
      t('panel.transparentBackground'),
      t('panel.backHome'),
      t('panel.addToFavorites'),
    ]) {
      expect(buttonByLabel(label), `missing corner action ${label}`).toBeTruthy();
    }
  });

  it('switches tabs and renders the 播放佇列 rows', async () => {
    const props = await render({ activeTab: 'queue' });
    const text = host?.textContent || '';
    expect(text).toContain(`${t('panel.queueTitle')} (3)`);
    for (const track of QUEUE) expect(text).toContain(track.title);
    expect(props.onTabChange).not.toHaveBeenCalled();
  });

  it('routes each hover action to its own queue mutation, without playing the row', async () => {
    const props = await render({ activeTab: 'queue' });
    const queueProps = props.queue as QueueTabProps;

    await click(buttonByLabel(t('panel.playNext')) as Element);
    expect(queueProps.onMoveToNext).toHaveBeenCalledWith(0);

    await click(buttonByLabel(t('panel.moveToEnd')) as Element);
    expect(queueProps.onMoveToEnd).toHaveBeenCalledWith(0);

    await click(buttonByLabel(t('panel.remove')) as Element);
    expect(queueProps.onRemove).toHaveBeenCalledWith(0);

    expect(queueProps.onPlaySong).not.toHaveBeenCalled();
  });

  it('plays a row when the row itself is clicked', async () => {
    const props = await render({ activeTab: 'queue' });
    const row = Array.from(document.querySelectorAll('[role="button"]'))
      .find(node => node.textContent?.includes('第二首'));
    await click(row as Element);
    expect((props.queue as QueueTabProps).onPlaySong).toHaveBeenCalledWith(QUEUE[1]);
  });

  it('shows the empty state when the queue has no rows', async () => {
    await render({ activeTab: 'queue', queue: makeQueue({ playlist: [] }) });
    expect(host?.textContent).toContain(t('panel.queueEmpty'));
  });

  it('uses the filled Sparkles icon once the song already has an AI theme', async () => {
    await render({ activeTab: 'controls', controls: makeControls({ hasSongAiTheme: true }) });
    const generate = buttonByLabel(t('panel.regenerateAiTheme')) as HTMLElement;
    expect(generate).toBeTruthy();
    // lucide's Sparkles draws more than one star path; Sparkle draws a single one.
    expect(generate.querySelectorAll('path').length).toBeGreaterThan(1);

    await click(generate);
  });

  it('uses the single Sparkle icon when there is no theme yet, and calls the generator', async () => {
    const props = await render({ activeTab: 'controls' });
    const generate = buttonByLabel(t('panel.generateAiTheme')) as HTMLElement;
    expect(generate.querySelectorAll('path').length).toBe(1);
    await click(generate);
    expect((props.controls as ControlsTabProps).onGenerateAiTheme).toHaveBeenCalledTimes(1);
  });

  it('exposes loop / like / daylight toggles on the 播放控制 tab', async () => {
    const props = await render({ activeTab: 'controls' });
    const controls = props.controls as ControlsTabProps;
    await click(buttonByLabel(t('panel.loopList')) as Element);
    expect(controls.onToggleLoop).toHaveBeenCalledTimes(1);
    await click(buttonByLabel(t('panel.like')) as Element);
    expect(controls.onToggleLike).toHaveBeenCalledTimes(1);
    await click(buttonByLabel(t('panel.switchToLight')) as Element);
    expect(controls.onToggleDaylight).toHaveBeenCalledTimes(1);
  });

  it('opens the quick theme editor from the theme name only when a theme exists', async () => {
    const opener = vi.fn();
    await render({ activeTab: 'controls', controls: makeControls({ hasSongAiTheme: true, onOpenThemeQuickEditor: opener }) });
    await click(buttonByLabel(t('panel.quickEditTheme')) as Element);
    expect(opener).toHaveBeenCalledTimes(1);
  });

  it('shows account state and library counters on the 帳戶資訊 tab', async () => {
    await render({ activeTab: 'account' });
    const text = host?.textContent || '';
    expect(text).toContain(t('panel.notConnected'));
    expect(text).toContain('3');
    expect(text).toContain('5');
    expect(buttonByText(t('panel.connect'))).toBeTruthy();
  });
});
