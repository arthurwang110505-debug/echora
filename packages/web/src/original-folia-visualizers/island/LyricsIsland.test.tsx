// @vitest-environment jsdom
//
// The island's own behaviour, as opposed to `islandModel.test.ts`'s arithmetic: does the component
// actually put the line on screen, drive the per-word wipe from the clock, and survive the states
// the player will genuinely hand it (no lyrics, no words, no translation, paused).
//
// The wipe is written straight to the DOM through refs, so it cannot be asserted from React's
// output - it has to be read off the rendered node after the clock moves. That is the point of the
// test: it is the only thing guarding the "karaoke" claim.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '../../types';
import type { IslandLine } from './islandModel';
import LyricsIsland from './LyricsIsland';

const THEME: Theme = {
  name: 'spec',
  backgroundColor: '#07090e',
  primaryColor: '#e8c88a',
  accentColor: '#62f5c4',
  secondaryColor: '#2f6f8f',
  fontStyle: 'sans',
  animationIntensity: 'calm',
};

const LYRICS: IslandLine[] = [
  {
    startTime: 10,
    endTime: 14,
    fullText: 'lai lai lai',
    translation: '來 來 來',
    words: [
      { text: 'lai ', startTime: 10, endTime: 12 },
      { text: 'lai ', startTime: 12, endTime: 13 },
      { text: 'lai', startTime: 13, endTime: 14 },
    ],
  },
  {
    startTime: 14,
    endTime: 18,
    fullText: 'next line',
    words: [],
  },
];

let host: HTMLDivElement;
let root: Root;

const mount = async (props: Partial<React.ComponentProps<typeof LyricsIsland>> = {}) => {
  const currentTime = props.currentTime ?? motionValue(11);
  host = document.createElement('div');
  document.body.append(host);
  const merged = {
    currentTime,
    currentLineIndex: 0,
    lines: LYRICS,
    theme: THEME,
    ...props,
  } as React.ComponentProps<typeof LyricsIsland>;
  await act(async () => {
    root = createRoot(host);
    root.render(<LyricsIsland {...merged} />);
  });
  return { currentTime, merged };
};

/** The lit copies are the ones carrying a clip-path straight after mount. */
const litWords = () =>
  Array.from(host.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'))
    .filter(node => node.style.clipPath !== '');

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('LyricsIsland', () => {
  it('shows the current line and its translation', async () => {
    await mount();
    expect(host.textContent).toContain('lai lai lai');
    expect(host.textContent).toContain('來 來 來');
  });

  it('wipes each word as the clock passes it', async () => {
    const { currentTime } = await mount();

    // 11 s: the first word is half done (10→12), the rest untouched.
    const atEleven = litWords().map(node => node.style.clipPath);
    expect(atEleven[0]).toContain('50%');
    expect(atEleven[1]).toContain('100%');

    // 13.5 s: first two finished, the last one half done.
    await act(async () => { currentTime.set(13.5); });
    const later = litWords().map(node => node.style.clipPath);
    expect(later[0]).toContain('0%');
    expect(later[1]).toContain('0%');
    expect(later[2]).toContain('50%');
  });

  it('falls back to the whole line when there is no word timing', async () => {
    await mount({ currentLineIndex: 1, currentTime: motionValue(15) });
    expect(host.textContent).toContain('next line');
    // No words means no wipe targets at all, and the text is not duplicated three ways.
    expect(litWords()).toHaveLength(0);
  });

  it('renders nothing without lyrics, instead of an empty pill', async () => {
    await mount({ lines: [], currentLineIndex: -1 });
    expect(host.textContent).toBe('');
  });

  it('hides itself when the caller says it is not visible', async () => {
    await mount({ visible: false });
    expect(host.textContent).toBe('');
  });

  it('can seek to a line and does not crash without a handler', async () => {
    const onSeekLine = vi.fn();
    await mount({ onSeekLine });
    const button = host.querySelector('[role="button"]');
    expect(button).toBeTruthy();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSeekLine).toHaveBeenCalledWith(10);

    // No handler: the island is not interactive, and clicking does nothing rather than throwing.
    act(() => root.unmount());
    host.remove();
    await mount();
    expect(host.querySelector('[role="button"]')).toBeNull();
  });

  it('exposes the line to assistive tech as a live region', async () => {
    await mount();
    const live = host.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('lai lai lai');
  });
});
