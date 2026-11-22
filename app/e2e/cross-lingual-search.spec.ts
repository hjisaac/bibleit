import { test, expect } from '@playwright/test';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };

test.describe('Cross-lingual Query Translation and Language Detection', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('bibleit:ui:active_tab', 'search');
    });
  });

  test('in French mode, detects English query and skips translation (sends translate=false)', async ({ page }) => {
    // Start directly in French mode
    await page.addInitScript(() => {
      localStorage.setItem('bibleit:pref:locale', 'fr');
    });

    let interceptedUrl: string | undefined;
    await page.route('**/api/v1/search*', async (route) => {
      interceptedUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          query: 'peace in anxiety',
          passages: [
            {
              chunk: {
                id: 1,
                book: 'PHP',
                start: [4, 7],
                end: [4, 7],
                text: 'Et la paix de Dieu, qui surpasse toute intelligence, gardera vos cœurs.',
              },
              score: 0.95,
              source: 'hybrid',
            },
          ],
          parsedRefs: [],
        }),
      });
    });

    await page.goto('/');

    const searchInput = page.getByRole('textbox');
    await expect(searchInput).toBeVisible();

    // Type English topical query in French mode
    await searchInput.fill('peace in anxiety');
    await searchInput.press('Enter');

    // Verify card is rendered
    await expect(page.locator('article').filter({ hasText: 'Philippiens 4:7' })).toBeVisible({ timeout: 15000 });

    // Assert that the request URL included translate=false because it detected English
    expect(interceptedUrl).toBeDefined();
    const parsed = new URL(interceptedUrl!);
    expect(parsed.searchParams.get('locale')).toBe('fr');
    expect(parsed.searchParams.get('translate')).toBe('false');
  });

  test('in French mode, executes translation for French topical query', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('bibleit:pref:locale', 'fr');
    });

    let interceptedUrl: string | undefined;
    await page.route('**/api/v1/search*', async (route) => {
      interceptedUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          query: "paix dans l'anxiété",
          translatedQuery: 'peace in anxiety',
          translatedBy: 'gemini',
          passages: [
            {
              chunk: {
                id: 1,
                book: 'PHP',
                start: [4, 7],
                end: [4, 7],
                text: 'Et la paix de Dieu, qui surpasse toute intelligence, gardera vos cœurs.',
              },
              score: 0.95,
              source: 'hybrid',
            },
          ],
          parsedRefs: [],
        }),
      });
    });

    await page.goto('/');

    const searchInput = page.getByRole('textbox');
    await searchInput.fill("paix dans l'anxiété");
    await searchInput.press('Enter');

    await expect(page.locator('article').filter({ hasText: 'Philippiens 4:7' })).toBeVisible({ timeout: 15000 });

    // In French mode with a French query, translate=false is NOT set
    expect(interceptedUrl).toBeDefined();
    const parsed = new URL(interceptedUrl!);
    expect(parsed.searchParams.get('locale')).toBe('fr');
    expect(parsed.searchParams.get('translate')).toBeNull();
  });

  test('disabling query translation in Settings forces translate=false for French queries', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('bibleit:pref:locale', 'fr');
    });

    let interceptedUrl: string | undefined;
    await page.route('**/api/v1/search*', async (route) => {
      interceptedUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          query: "paix dans l'anxiété",
          passages: [
            {
              chunk: {
                id: 1,
                book: 'PHP',
                start: [4, 7],
                end: [4, 7],
                text: 'Et la paix de Dieu, qui surpasse toute intelligence, gardera vos cœurs.',
              },
              score: 0.95,
              source: 'hybrid',
            },
          ],
          parsedRefs: [],
        }),
      });
    });

    await page.goto('/');

    // 1. Go to Settings and uncheck Automatic Query Translation
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: fr['main/navbar'].settings }).click();

    const translationToggle = page.getByRole('checkbox', { name: fr['settings/view'].queryTranslationTitle });
    await expect(translationToggle).toBeChecked();
    await translationToggle.evaluate((el: HTMLInputElement) => el.click());
    await expect(translationToggle).not.toBeChecked();

    // 2. Return to Search and run French topical query
    await page.evaluate(() => {
      const section = document.querySelector('section');
      if (section) {
        section.scrollTop = 0;
        section.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
    await nav.getByRole('button', { name: fr['main/navbar'].search }).click({ force: true });
    const searchInput = page.getByRole('textbox');
    await searchInput.fill("paix dans l'anxiété");
    await searchInput.press('Enter');

    await expect(page.locator('article').filter({ hasText: 'Philippiens 4:7' })).toBeVisible({ timeout: 15000 });

    // 3. Since user disabled translation, translate=false is sent
    expect(interceptedUrl).toBeDefined();
    const parsed = new URL(interceptedUrl!);
    expect(parsed.searchParams.get('locale')).toBe('fr');
    expect(parsed.searchParams.get('translate')).toBe('false');
  });

  test('switching interface language from English to French resets stale AI overview answer', async ({ page }) => {
    await page.route('**/api/v1/search*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          query: 'What is love?',
          passages: [
            {
              chunk: {
                id: 1,
                book: '1JN',
                start: [4, 8],
                end: [4, 8],
                text: 'God is love.',
              },
              score: 0.98,
              source: 'semantic',
            },
          ],
          parsedRefs: [],
        }),
      });
    });

    await page.route('**/api/v1/generate*', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Provider': 'gemini',
        },
        body: 'God is love and whoever abides in love abides in God.',
      });
    });

    await page.goto('/');

    // 1. Execute search in English
    const searchInput = page.getByRole('textbox');
    await searchInput.fill('What is love?');
    await searchInput.press('Enter');

    // 2. Wait for AI generated overview to appear
    await expect(page.getByText('God is love and whoever abides in love abides in God.')).toBeVisible({ timeout: 15000 });

    // 3. Navigate to Settings and switch language to French
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: en['main/navbar'].settings }).click();
    await page.locator('select').selectOption('fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    // 4. Return to Search view: stale English answer text should be cleared
    await nav.getByRole('button', { name: fr['main/navbar'].search }).click();
    await expect(page.getByText('God is love and whoever abides in love abides in God.')).toBeHidden();
  });
});
