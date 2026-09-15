import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Welcome, { WELCOME_APP_TARGET, WELCOME_DEMO_TARGET } from './Welcome';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  // The footer ships real anchors (crawlable, and required by Google's OAuth
  // brand verification), so the stub keeps the href visible in static markup.
  Link: ({ to, className, children }: { to: string; className?: string; children?: ReactNode }) => (
    <a href={to} className={className}>{children}</a>
  ),
}));

describe('Welcome landing page', () => {
  it('targets the demo experience and the app shell exactly as the two-entrance spec defines', () => {
    // The landing page never gates the product: main CTA goes to /app?demo=1,
    // the low-key entrance goes straight to /app.
    expect(WELCOME_DEMO_TARGET).toBe('/app?demo=1');
    expect(WELCOME_APP_TARGET).toBe('/app');
  });

  it('shows the primary CTA and the low-key returning-user entrance', () => {
    const markup = renderToStaticMarkup(<Welcome />);

    expect(markup).toContain('開始體驗');
    expect(markup).toContain('開啟播放器');
    expect(markup).toContain('都成為一座舞台。');
  });

  it('introduces the product without demanding a connection first', () => {
    const markup = renderToStaticMarkup(<Welcome />);

    expect(markup).toContain('動態歌詞舞台');
    expect(markup).toContain('連接你的音樂');
    expect(markup).toContain('免登入');
  });

  // Google's brand verification reviews the homepage itself: it must describe
  // the app, link the privacy policy/terms with plain anchors, and state how
  // Google user data is used.
  it('hosts crawlable policy links and the Google user-data disclosure', () => {
    const markup = renderToStaticMarkup(<Welcome />);

    expect(markup).toContain('href="/privacy"');
    expect(markup).toContain('href="/terms"');
    expect(markup).toContain('https://www.youtube.com/t/terms');
    expect(markup).toContain('https://policies.google.com/privacy');
    expect(markup).toContain('YouTube API Services');
    expect(markup).toContain('Limited Use');
  });
});
