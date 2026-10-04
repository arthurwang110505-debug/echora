// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Welcome, { WELCOME_APP_TARGET, WELCOME_DEMO_TARGET } from './Welcome';
import KaraokeLine from '../components/landing/KaraokeLine';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, className, children }: { to: string; className?: string; children?: ReactNode }) => (
    <a href={to} className={className}>{children}</a>
  ),
}));

// jsdom lacks a few browser APIs the landing stage relies on; the components
// must tolerate their absence (real browsers always provide them).
beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = window.matchMedia || ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver =
    class { observe() {} unobserve() {} disconnect() {} };
  (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver =
    class {
      root = null;
      rootMargin = '';
      thresholds = [];
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    };
});

describe('Landing stage (Welcome) mounted smoke', () => {
  const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

  const mount = (ui: React.ReactNode) => {
    const container = document.body.appendChild(document.createElement('div'));
    const root = createRoot(container);
    act(() => { root.render(ui); });
    mounted.push({ root, container });
    return container;
  };

  afterEach(() => {
    while (mounted.length) {
      const { root, container } = mounted.pop()!;
      act(() => { root.unmount(); });
      container.remove();
    }
  });

  const waitFor = async (assert: () => void, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        assert();
        return;
      } catch (error) {
        if (Date.now() > deadline) throw error;
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
      }
    }
  };

  it('keeps the two-entrance targets exactly as specced', () => {
    expect(WELCOME_DEMO_TARGET).toBe('/app?demo=1');
    expect(WELCOME_APP_TARGET).toBe('/app');
  });

  it('mounts the stage hero with canvas, karaoke words, marquee and CTA', async () => {
    const container = mount(<Welcome />);

    expect(container.querySelector('canvas[aria-hidden="true"]')).toBeTruthy();
    expect(container.textContent).toContain('都成為一座舞台。');
    expect(container.textContent).toContain('開始體驗');
    expect(container.textContent).toContain('開啟播放器');
    // Marquee renders two identical copies for the seamless loop.
    expect(container.querySelectorAll('.stage-marquee > div').length).toBe(2);
    expect(container.querySelectorAll('.karaoke-word').length).toBeGreaterThan(0);

    // The karaoke preview starts filling words shortly after mount.
    await waitFor(() => {
      expect(document.querySelectorAll('.karaoke-word.is-filled').length).toBeGreaterThan(0);
    });
  });

  it('advances the karaoke line to the next phrase after fill + hold', async () => {
    const container = mount(
      <KaraokeLine
        lines={['第一句', '第二句']}
        wordMs={10}
        stagger={0.2}
        holdMs={40}
        className="text-lg"
      />,
    );

    const baseText = () => Array.from(container.querySelectorAll('.karaoke-word-base'))
      .map(element => element.textContent)
      .join('');
    expect(baseText()).toContain('第一句');
    await waitFor(() => {
      expect(baseText()).toContain('第二句');
    });
  });

  it('shows every demo scene layer so the crossfade can swap opacity', () => {
    const container = mount(<Welcome />);
    const scenes = container.querySelectorAll('.stage-scene-bg');
    expect(scenes.length).toBe(3);
    expect(scenes[0].getAttribute('style')).toContain('opacity: 1');
  });

  it('runs the stage preview with real transport controls (prev / next / pause)', () => {
    const container = mount(<Welcome />);
    const buttonByLabel = (label: string) =>
      Array.from(container.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === label);
    const activeMode = () => container.querySelector('.stage-chip-enter')?.textContent?.trim();

    const play = container.querySelector('button[aria-pressed]') as HTMLButtonElement | null;
    expect(play).toBeTruthy();
    expect(play!.getAttribute('aria-pressed')).toBe('true');
    // Pause freezes the preview (and the ambient blobs) instead of faking playback.
    act(() => { play!.click(); });
    expect(play!.getAttribute('aria-pressed')).toBe('false');

    expect(activeMode()).toBe('Luminous');
    act(() => { buttonByLabel('下一句歌詞')!.click(); });
    expect(activeMode()).toBe('Fume');
    act(() => { buttonByLabel('上一句歌詞')!.click(); });
    expect(activeMode()).toBe('Luminous');
    // Stepping backwards from the first scene wraps to the last one.
    act(() => { buttonByLabel('上一句歌詞')!.click(); });
    expect(activeMode()).toBe('Monet');
  });

  it('offers the demo CTA inside the stage preview transport', () => {
    const container = mount(<Welcome />);
    // The transport's right-hand button is the same 開始體驗 entrance as the hero.
    expect(container.querySelectorAll('.glass-panel button').length).toBeGreaterThanOrEqual(4);
    expect(container.textContent).toContain('開始體驗');
  });
});
