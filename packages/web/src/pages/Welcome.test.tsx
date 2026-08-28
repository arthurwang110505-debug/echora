import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Welcome, { WELCOME_APP_TARGET, WELCOME_DEMO_TARGET } from './Welcome';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
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
});
