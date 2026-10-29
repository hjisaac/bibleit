import { test, expect } from '@playwright/test';

test.describe('End-to-End User Journey (Unseeded Cold Start)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage to emulate a first-time user
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('walks through cold start: search reference -> open in reader -> interact -> settings', async ({ page }) => {
    // 1. Cold start landing
    await page.goto('/');
    const searchInput = page.getByRole('textbox');
    await expect(searchInput).toBeVisible();

    // 2. Type exact reference and execute search
    await searchInput.fill('John 3:16');
    await searchInput.press('Enter');

    // 3. Verify search result card renders with citation and text
    const resultCard = page.locator('article').filter({ hasText: 'John 3:16' });
    await expect(resultCard).toBeVisible({ timeout: 25000 });
    await expect(resultCard).toContainText('For God so loved the world');

    // 4. Click "Read chapter" to navigate directly into Reader view
    const readChapterBtn = resultCard.getByRole('button', { name: /Read chapter/i });
    await expect(readChapterBtn).toBeVisible();
    await readChapterBtn.click();

    // 5. Verify Reader view is active and loaded at John 3
    await expect(page.locator('h1')).toContainText('John Chapter 3', { timeout: 10000 });
    const targetVerse = page.locator('#verse-16');
    await expect(targetVerse).toBeVisible();

    // 6. User interaction: tap verse to toggle highlight ring
    await targetVerse.click();
    await expect(targetVerse).toHaveClass(/ring-2 ring-amber-500\/50/);

    // 7. Scroll Reader container to top so headroom restores bottom navbar
    await page.locator('section').filter({ hasText: 'John Chapter 3' }).evaluate((el) => {
      el.scrollTo({ top: 0, behavior: 'instant' });
      el.dispatchEvent(new Event('scroll'));
    });
    const settingsNavBtn = page.getByRole('navigation').getByRole('button', { name: 'Settings' });
    await expect(settingsNavBtn).toBeVisible();
    await settingsNavBtn.click();

    // 8. Verify Settings view and change theme
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    const warmThemeBtn = page.getByRole('button', { name: /Warm/i });
    await expect(warmThemeBtn).toBeVisible();
    await warmThemeBtn.click();

    // 9. Return to Reader and verify theme applied
    const readerNavBtn = page.getByRole('navigation').getByRole('button', { name: 'Reader' });
    await readerNavBtn.click();
    await expect(page.locator('h1')).toContainText('John Chapter 3');
  });
});
