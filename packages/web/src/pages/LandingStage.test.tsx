// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Welcome, { WELCOME_APP_TARGET, WELCOME_DEMO_TARGET } from './Welcome';
import KaraokeLine from '../components/landing/KaraokeLine';
import zhTW from '../i18n/locales/home.zh-TW.json';
import { LANDING_FEATURES, MODE_SCENES } from '../components/landing/landingContent';
import { VISUALIZER_OPTIONS } from '../components/player/panel/stageOptions';
import en from '../i18n/locales/home.en.json';
import { LANDING_HANDOFF_KEY } from '../utils/landingHandoff';

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

  it('mounts the overture with the lighting canvas, the synced lyric stage and both entrances', async () => {
    const container = mount(<Welcome />);

    expect(container.querySelector('canvas[aria-hidden="true"]')).toBeTruthy();
    expect(container.textContent).toContain('都成為一座舞台。');
    expect(container.textContent).toContain('開始體驗');
    expect(container.textContent).toContain('開啟播放器');
    // The lyric stage renders the real demo transcript word by word, with
    // timestamps the clock can light.
    const words = Array.from(container.querySelectorAll('.synced-word')) as HTMLElement[];
    expect(words.length).toBeGreaterThan(0);
    expect(words.every(word => Number.isFinite(Number(word.dataset.start)))).toBe(true);
    const baseText = Array.from(container.querySelectorAll('.synced-word .karaoke-word-base')).map(node => node.textContent).join('').replace(/\u00A0/g, ' ');
    expect(baseText).toContain('In the midnight glow');

    // The silent virtual clock starts at once, so the first words light up
    // without any audio permission.
    await waitFor(() => {
      expect(document.querySelectorAll('.synced-word.is-filled').length).toBeGreaterThan(0);
    });
  });

  it('keeps the legacy KaraokeLine advancing to the next phrase after fill + hold', async () => {
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

  it('lays the show out as scroll-driven acts in performance order', () => {
    const container = mount(<Welcome />);
    const acts = Array.from(container.querySelectorAll('[data-act]')).map(act => act.getAttribute('data-act'));
    expect(acts).toEqual(['overture', 'modes', 'features', 'manifesto', 'finale']);
    // The Modes act hosts the player's real stage (mounted lazily once it is
    // near the viewport) and lists every mode as a progress step.
    expect(container.querySelector('[data-act="modes"] [data-live-stage]')).toBeTruthy();
    expect(container.querySelectorAll('[data-act="modes"] ol li').length).toBe(MODE_SCENES.length);
    expect(container.textContent).toContain(MODE_SCENES[0].name);
    // The features act is a horizontal cue sheet with every feature card.
    expect(container.querySelectorAll('[data-act="features"] article').length).toBe(LANDING_FEATURES.length);
  });

  it('promises exactly the stage modes the player offers, in the same order', () => {
    expect(MODE_SCENES.map(scene => scene.id)).toEqual(VISUALIZER_OPTIONS.map(option => option.value));
    expect(MODE_SCENES.map(scene => scene.name)).toEqual(VISUALIZER_OPTIONS.map(option => option.label));
    // Every mode has copy in both locales.
    for (const scene of MODE_SCENES) {
      const key = scene.descriptionKey.replace('welcome.', '') as keyof typeof zhTW.welcome;
      expect(zhTW.welcome[key]).toBeTruthy();
      expect(en.welcome[key]).toBeTruthy();
    }
  });

  it('exposes sound as an explicit opt-in (never autoplay) with a pressed-state toggle', () => {
    const container = mount(<Welcome />);
    const toggle = container.querySelector('header button[aria-pressed]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();
    expect(toggle!.getAttribute('aria-pressed')).toBe('false');
    expect(container.textContent).toContain(zhTW.welcome.enterStage);
  });

  it('reveals the manifesto one token at a time, driven by scroll position', () => {
    const container = mount(<Welcome />);
    const manifesto = Array.from(container.querySelectorAll('p'))
      .find(paragraph => paragraph.textContent === zhTW.welcome.manifesto);
    expect(manifesto).toBeTruthy();

    // One span per character (CJK advances per character) so the fill can
    // stagger across the scroll range.
    const tokens = Array.from(manifesto!.querySelectorAll('span.inline-block')) as HTMLElement[];
    expect(tokens.length).toBe(Array.from(zhTW.welcome.manifesto).length);
    // Unlit words are dimmed, never hidden — the copy is always readable and
    // the reveal re-dims when the reader scrolls back up.
    expect(tokens.every(token => token.style.opacity === '0.16')).toBe(true);

    // The final CTA heading rides the same scroll-driven reveal.
    const readyHeading = Array.from(container.querySelectorAll('h2'))
      .find(heading => heading.textContent === zhTW.welcome.readyTitle);
    expect(readyHeading?.querySelectorAll('span.inline-block').length).toBeGreaterThan(0);
  });

  it('records a hand-off so /app continues the same song when 開始體驗 is tapped', () => {
    const container = mount(<Welcome />);
    const cta = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('開始體驗'));
    expect(cta).toBeTruthy();
    act(() => { cta!.click(); });
    const raw = window.sessionStorage.getItem(LANDING_HANDOFF_KEY);
    expect(raw).toBeTruthy();
    const handoff = JSON.parse(raw!) as { songId: string; time: number; soundEnabled: boolean };
    expect(handoff.songId).toBe('demo-dancing-in-the-stardust');
    expect(handoff.time).toBeGreaterThanOrEqual(0);
    expect(handoff.soundEnabled).toBe(false);
  });
});
