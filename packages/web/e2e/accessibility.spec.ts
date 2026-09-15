import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const CRITICAL_ONLY = { impact: ['critical'] as const };

test.describe('axe accessibility scan', () => {
  test('landing page has no critical violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /讓每一首歌/ })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const critical = results.violations.filter((violation) => violation.impact === 'critical');
    expect(critical).toEqual([]);
  });

  test('app shell has no critical violations', async ({ page }) => {
    await page.goto('/app?demo=1');
    await expect(page.getByRole('button', { name: '切換來源至 本機展示' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const critical = results.violations.filter((violation) => violation.impact === 'critical');
    expect(critical).toEqual([]);
  });
});
