import { expect, test } from '@playwright/test';

test.describe('Echora smoke paths', () => {
  test('landing page renders headline and demo CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /讓每一首歌/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '開始體驗' }).first()).toBeVisible();
  });

  test('landing page links the policies Google verification asks for', async ({ page }) => {
    await page.goto('/');
    // Plain anchors, not onClick buttons: Google's OAuth brand verification and
    // crawlers both need to follow these links from the homepage.
    await expect(page.getByRole('link', { name: '隱私權政策' }).first()).toHaveAttribute('href', '/privacy');
    await expect(page.getByRole('link', { name: '服務條款' }).first()).toHaveAttribute('href', '/terms');
    await expect(page.getByRole('link', { name: 'Manage Google access' }).first()).toHaveAttribute(
      'href',
      'https://myaccount.google.com/permissions',
    );
  });

  test('robots.txt and sitemap.xml are served instead of the app shell', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain('Sitemap:');

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain('<loc>');
  });

  test('app shell loads the local demo catalog', async ({ page }) => {
    await page.goto('/app?demo=1');
    await expect(page.getByRole('button', { name: '切換來源至 本機展示' })).toBeVisible();
    await expect(page.getByRole('button', { name: '以網格列表瀏覽' })).toBeVisible();
  });

  test('demo song flow reaches the player', async ({ page }) => {
    await page.goto('/app?demo=1');
    await page.getByRole('button', { name: '以網格列表瀏覽' }).click();
    await page.getByRole('button', { name: /^播放 / }).first().click();
    await expect(page).toHaveURL(/\/player/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('library renders connect guidance without login', async ({ page }) => {
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: '我的音樂庫' })).toBeVisible();
  });

  test('settings page renders', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Echora 設定' })).toBeVisible();
  });
});
