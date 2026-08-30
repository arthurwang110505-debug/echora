import { expect, test } from '@playwright/test';

test.describe('Echora smoke paths', () => {
  test('landing page renders headline and demo CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /讓每一首歌/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '開始體驗' }).first()).toBeVisible();
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
