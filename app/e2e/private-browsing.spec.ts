import { test, expect } from '@playwright/test';
import { simulateBackendOffline } from './fixtures/network';

// Firefox private browsing rejects navigator.storage.getDirectory() with SecurityError.
test.describe('Private browsing (OPFS unavailable)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      Object.defineProperty(navigator.storage, 'getDirectory', {
        value: () => Promise.reject(new DOMException('The operation is insecure.', 'SecurityError')),
      });
    });
  });

  test('search works after downloading Scripture text even though nothing can be persisted', async ({ page }) => {
    await simulateBackendOffline(page);
    await page.goto('/');

    const searchInput = page.getByRole('textbox');
    await searchInput.fill('What did Jesus teach about worry?');
    await searchInput.press('Enter');
    await expect(page.getByText('Search service currently unavailable')).toBeVisible({ timeout: 10000 });

    await page.getByRole('navigation').getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Download (1.2 MB)' }).click();
    await expect(page.getByText('✓ Installed')).toBeVisible({ timeout: 25000 });

    await page.locator('section').filter({ hasText: 'Settings' }).evaluate((el) => {
      el.scrollTo({ top: 0, behavior: 'instant' });
      el.dispatchEvent(new Event('scroll'));
    });
    await page.getByRole('navigation').getByRole('button', { name: 'Search' }).click();

    await expect(page.locator('article').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No matching passages found')).not.toBeVisible();
  });
});
