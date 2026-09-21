// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import TransportBar from './TransportBar';

const t = (key: string) => i18n.t(key);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const render = async () => {
  host = document.createElement('div');
  document.body.append(host);
  await act(async () => {
    root = createRoot(host as HTMLDivElement);
    root.render(
      <TransportBar
        isYouTubeVideoMode={false}
        isPlaying={false}
        displayedTime={12}
        duration={200}
        isSeeking={false}
        seekPreviewTime={null}
        activeVisualizer="classic"
        showCalibration={false}
        lyricsOffsetSeconds={0}
        lyricsOffsetLabel="synced"
        onSeekPreview={vi.fn()}
        onSeekStart={vi.fn()}
        onSeekCommit={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onPlayPause={vi.fn()}
        onEnterStage={vi.fn()}
        onToggleCalibration={vi.fn()}
        onAdjustOffset={vi.fn()}
        onResetOffset={vi.fn()}
        onImportLyrics={vi.fn(() => true)}
        onToggleTuning={vi.fn()}
      />,
    );
  });
};

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  host?.remove();
  host = null;
});

describe('TransportBar stage entry point', () => {
  it('labels the button 全螢幕 instead of the old hardcoded "Stage"', async () => {
    await render();
    const button = Array.from(document.querySelectorAll('button'))
      .find(candidate => candidate.getAttribute('aria-label') === t('player.enterFullscreenAria'));

    expect(button, 'the fullscreen button must exist').toBeTruthy();
    expect(button?.textContent).toBe(t('player.enterFullscreen'));
    expect(button?.textContent).not.toContain('Stage');
    expect(host?.textContent).not.toMatch(/>Stage</);
  });

  it('resolves the label in both bundled locales', async () => {
    const zh = i18n.getResource('zh-TW', 'translation', 'player.enterFullscreen');
    const en = i18n.getResource('en', 'translation', 'player.enterFullscreen');
    expect(zh).toBe('全螢幕');
    expect(en).toBe('Fullscreen');
  });
});
