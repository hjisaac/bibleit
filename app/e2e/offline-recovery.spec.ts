import { test, expect } from '@playwright/test';
import { simulateBackendOffline } from './fixtures/network';

test.describe('Offline Scripture Recovery Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(async () => {
      localStorage.clear();
      sessionStorage.clear();
      if (navigator.storage?.getDirectory) {
        const root = await navigator.storage.getDirectory();
        for await (const name of (root as any).keys?.() ?? []) {
          try {
            await root.removeEntry(name);
          } catch {}
        }
      }
    });
  });

  test('user queries while backend is offline, downloads text in settings, and transitions cleanly back to search', async ({ page }) => {
    // 1. Simulate remote backend being completely unreachable
    await simulateBackendOffline(page);

    await page.goto('/');

    const searchInput = page.getByRole('textbox');
    await expect(searchInput).toBeVisible();

    // 2. Search query before any offline scripture is downloaded
    await searchInput.fill('What did Jesus teach about worry?');
    await searchInput.press('Enter');

    // 3. UI should show service unavailable / setup state — NEVER "No matching passages found"
    await expect(page.getByText('Search service currently unavailable')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No matching passages found')).not.toBeVisible();

    // 4. Navigate to Settings and download Scripture text
    const settingsNavBtn = page.getByRole('navigation').getByRole('button', { name: 'Settings' });
    await settingsNavBtn.click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    const downloadBtn = page.getByRole('button', { name: 'Download (1.2 MB)' });
    await downloadBtn.click();
    await expect(page.getByText('✓ Installed')).toBeVisible({ timeout: 25000 });

    // 5. Restore headroom scroll and return to Search tab
    await page.locator('section').filter({ hasText: 'Settings' }).evaluate((el) => {
      el.scrollTo({ top: 0, behavior: 'instant' });
      el.dispatchEvent(new Event('scroll'));
    });

    const searchNavBtn = page.getByRole('navigation').getByRole('button', { name: 'Search' });
    await expect(searchNavBtn).toBeVisible({ timeout: 5000 });
    await searchNavBtn.click();

    // 6. CORE EXPECTATION:
    // It must NOT show "No matching passages found"!
    await expect(page.getByText('No matching passages found')).not.toBeVisible();

    // Passage result cards must be rendered from the local engine
    await expect(page.locator('article').first()).toBeVisible({ timeout: 10000 });
  });
});
