import { expect, test } from '@playwright/test';

// These specs guard the "the page plays but makes no sound" class of bug. Everything that
// can be proven without leaving the origin (element wiring, CORS opt-in, volume state,
// stage chrome) runs always; only the audible-progress assertion needs the demo CDN.

const DEMO_SONG = 'https://cdn.jsdelivr.net/gh/arthurwang110505-debug/video@main/tDiAzOyrXMtgfJhq.mp3';

const startFirstDemoSong = async (page: import('@playwright/test').Page) => {
  await page.goto('/app?demo=1');
  await page.getByRole('button', { name: '以網格列表瀏覽' }).click();
  await page.getByRole('button', { name: /^播放 / }).first().click();
  await expect(page).toHaveURL(/\/player/);
};

const demoCdnReachable = async (request: import('@playwright/test').APIRequestContext) => {
  try {
    const response = await request.get(DEMO_SONG, { headers: { Range: 'bytes=0-1' } });
    return response.ok() || response.status() === 206;
  } catch {
    return false;
  }
};

test.describe('local audio wiring', () => {
  test('routes cross-origin demo audio through the analyser only with a CORS opt-in', async ({ page }) => {
    await startFirstDemoSong(page);
    const audio = page.locator('audio');
    await expect(audio).toHaveAttribute('crossorigin', 'anonymous');
    await expect
      .poll(() => audio.evaluate(element => element.getAttribute('src')?.includes('cdn.jsdelivr.net/gh/') ?? false))
      .toBe(true);
  });

  test('keeps the audible level non-zero and the element unmuted after selecting a song', async ({ page }) => {
    await startFirstDemoSong(page);
    const state = await page.locator('audio').evaluate(element => ({
      volume: element.volume,
      muted: element.muted,
      error: element.error?.code ?? null,
    }));
    expect(state.muted).toBe(false);
    expect(state.volume).toBeGreaterThan(0);
  });

  test('volume survives a mute / unmute round trip and a reload', async ({ page }) => {
    await startFirstDemoSong(page);

    await page.keyboard.press('m');
    const muted = await page.locator('audio').evaluate(element => ({ volume: element.volume, muted: element.muted }));
    expect(muted.volume).toBe(0);

    await page.keyboard.press('m');
    const restored = await page.locator('audio').evaluate(element => element.volume);
    expect(restored).toBeGreaterThan(0);

    await page.reload();
    const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('echora.playback-snapshot') || '{}'));
    expect(afterReload.volume).toBeGreaterThan(0);
  });

  test('never shows volume controls inside the immersive stage, and shows them outside it', async ({ page }) => {
    await startFirstDemoSong(page);
    await expect(page.getByTestId('volume-control')).toBeVisible();
    await page.getByRole('button', { name: '進入沉浸舞台' }).click();
    await expect(page.getByTestId('volume-control')).toHaveCount(0);
  });

  test('audio actually advances and Web Audio ends up running', async ({ page, request }) => {
    test.skip(!(await demoCdnReachable(request)), 'demo audio CDN is unreachable from this environment');
    await startFirstDemoSong(page);

    const first = await page.locator('audio').evaluate(element => element.currentTime);
    await page.waitForTimeout(1500);
    const second = await page.locator('audio').evaluate(element => element.currentTime);
    expect(second).toBeGreaterThan(first);

    // The dev-only console hook reports the routing decision, so the spec asserts the
    // graph is genuinely running instead of trusting the play button's state.
    const health = await page.evaluate(() => {
      const probe = (window as unknown as {
        __echoraAnalyserHealth?: () => { contextState?: string; routing?: { mode?: string } };
      }).__echoraAnalyserHealth;
      return {
        volume: document.querySelector('audio')?.volume ?? 0,
        contextState: probe?.()?.contextState ?? 'missing',
        mode: probe?.()?.routing?.mode ?? 'missing',
      };
    });
    expect(health.volume).toBeGreaterThan(0);
    expect(health.mode).toBe('analyser');
    expect(health.contextState).toBe('running');
  });
});
