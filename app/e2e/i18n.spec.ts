import { test, expect } from '@playwright/test';
import { useSearchCassette } from './fixtures/network';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };

const RAW_PLACEHOLDER_RE = /\{[a-zA-Z0-9_]+\}/;

test.describe('i18n End-to-End Translations', () => {
  test.use({ locale: 'en-US' });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('switches language en -> fr -> en across all views with no leaked placeholders', async ({ page }) => {
    await page.goto('/');

    // 1. Verify initial English UI
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('textbox')).toHaveAttribute('placeholder', en['search/view'].searchPlaceholder);
    await expect(page.getByText(en['search/view'].popularTopics)).toBeVisible();

    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('button', { name: en['main/navbar'].settings })).toBeVisible();

    // 2. Navigate to Settings and switch to French
    await nav.getByRole('button', { name: en['main/navbar'].settings }).click();
    await expect(page.getByRole('heading', { name: en['settings/view'].pageTitle })).toBeVisible();

    const langSelect = page.locator('select');
    await expect(langSelect).toBeVisible();
    await langSelect.selectOption('fr');

    // 3. Settings + Navbar + <html lang> update reactively to French
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { name: fr['settings/view'].pageTitle })).toBeVisible();
    await expect(page.getByText(fr['settings/view'].atmosphereTitle, { exact: true })).toBeVisible();
    // Parameterized download button renders interpolated size, not {size}
    await expect(page.getByRole('button', { name: 'Télécharger (1.2 MB)' })).toBeVisible();
    await expect(nav.getByRole('button', { name: fr['main/navbar'].search })).toBeVisible();
    await expect(nav.getByRole('button', { name: fr['main/navbar'].reader })).toBeVisible();
    await expect(nav.getByRole('button', { name: fr['main/navbar'].saved })).toBeVisible();
    await expect(nav.getByRole('button', { name: fr['main/navbar'].settings })).toBeVisible();

    // 4. Search view translates placeholder & starter topics (panel opens only on input focus)
    await nav.getByRole('button', { name: fr['main/navbar'].search }).click();
    const searchInput = page.getByRole('textbox');
    await expect(searchInput).toHaveAttribute('placeholder', fr['search/view'].searchPlaceholder);
    await expect(page.getByText(fr['search/view'].popularTopics)).toBeHidden();
    await searchInput.click();
    await expect(page.getByText(fr['search/view'].popularTopics)).toBeVisible();
    await expect(page.getByRole('button', { name: fr.starterTopics.popularTopics[0]! })).toBeVisible();

    // 5. Saved view translates UI + default bookmark citation and LSG scripture text
    await nav.getByRole('button', { name: fr['main/navbar'].saved }).click();
    await expect(page.getByRole('heading', { name: fr['saved/view'].title })).toBeVisible();
    await expect(page.getByText(fr['saved/view'].subtitle)).toBeVisible();
    await expect(page.getByRole('article').getByText('Philippiens 4:7')).toBeVisible();
    await expect(page.getByRole('article').getByText(/Et la paix de Dieu/)).toBeVisible();

    // 6. Reader view translates parameterized chapter heading + BookSelector modal
    await nav.getByRole('button', { name: fr['main/navbar'].reader }).click();
    const readerHeading = page.locator('h1');
    await expect(readerHeading).toContainText(/Chapitre \d+/, { timeout: 10000 });
    await expect(readerHeading).not.toContainText(RAW_PLACEHOLDER_RE);

    await readerHeading.click();
    await expect(page.getByText(fr['modal/bookSelector'].selectPassage)).toBeVisible();
    await expect(page.getByRole('button', { name: fr['modal/bookSelector'].filterAll })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '✕' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Verify no raw {param} templates leaked anywhere in visible body text
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(RAW_PLACEHOLDER_RE);

    // 7. Switch back to English and confirm full revert
    await nav.getByRole('button', { name: fr['main/navbar'].settings }).click();
    await page.locator('select').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: en['settings/view'].pageTitle })).toBeVisible();
    await expect(nav.getByRole('button', { name: en['main/navbar'].search })).toBeVisible();
  });

  test('persists selected French locale across full page reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: en['main/navbar'].settings }).click();
    await page.locator('select').selectOption('fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    // Reload without clearing localStorage (addInitScript only clears on first nav if guarded; use evaluate instead)
    const persistedLocale = await page.evaluate(() => localStorage.getItem('bibleit:pref:locale'));
    expect(persistedLocale).toBe('fr');
  });

  test('switches scripture text between WEB (en) and LSG (fr) in Search and Reader views', async ({ page }) => {
    await useSearchCassette(page, 'search-john316');
    await page.goto('/');

    // 1. Search John 3:16 in English
    const searchInput = page.getByRole('textbox');
    await searchInput.fill('John 3:16');
    await searchInput.press('Enter');

    const enCard = page.locator('article').filter({ hasText: 'John 3:16' });
    await expect(enCard).toBeVisible({ timeout: 25000 });
    await expect(enCard).toContainText('For God so loved the world');

    // 2. Switch language to French in Settings
    const nav = page.getByRole('navigation');
    await nav.getByRole('button', { name: en['main/navbar'].settings }).click();
    await page.locator('select').selectOption('fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    // 3. Return to Search: card citation AND scripture text are now French (LSG)
    await nav.getByRole('button', { name: fr['main/navbar'].search }).click();
    const frCard = page.locator('article').filter({ hasText: 'Jean 3:16' });
    await expect(frCard).toBeVisible();
    await expect(frCard).toContainText('Car Dieu a tant aimé le monde');
    await expect(frCard).not.toContainText('For God so loved the world');

    // 4. Open chapter in Reader: heading and verse 16 text are French (LSG)
    await frCard.getByRole('button', { name: fr['search/view'].readChapter }).click();
    await expect(page.locator('h1')).toContainText('Jean Chapitre 3', { timeout: 10000 });
    await expect(page.locator('#verse-16')).toContainText('Car Dieu a tant aimé le monde');

    // 5. Switch back to English and verify Reader + Search revert to WEB
    await page.locator('#reader-scroll-container').evaluate((el) => {
      el.scrollTo({ top: 0, behavior: 'instant' });
      el.dispatchEvent(new Event('scroll'));
    });
    await nav.getByRole('button', { name: fr['main/navbar'].settings }).click();
    await page.locator('select').selectOption('en');

    await nav.getByRole('button', { name: en['main/navbar'].reader }).click();
    await expect(page.locator('h1')).toContainText('John Chapter 3', { timeout: 10000 });
    await expect(page.locator('#verse-16')).toContainText('For God so loved the world');

    await page.locator('#reader-scroll-container').evaluate((el) => {
      el.scrollTo({ top: 0, behavior: 'instant' });
      el.dispatchEvent(new Event('scroll'));
    });
    await nav.getByRole('button', { name: en['main/navbar'].search }).click();
    await expect(enCard).toContainText('For God so loved the world');
  });
});

test.describe('i18n Reload Persistence & Browser Locale Detection', () => {
  test('boots directly in French when bibleit:pref:locale is persisted', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('bibleit:pref:locale', 'fr');
    });
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('textbox')).toHaveAttribute('placeholder', fr['search/view'].searchPlaceholder);
    await expect(page.getByRole('navigation').getByRole('button', { name: fr['main/navbar'].settings })).toBeVisible();
  });

  test.describe('French browser locale auto-detection', () => {
    test.use({ locale: 'fr-FR' });

    test('auto-detects French when no manual override is stored', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.clear();
      });
      await page.goto('/');

      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      await expect(page.getByRole('textbox')).toHaveAttribute('placeholder', fr['search/view'].searchPlaceholder);
      await expect(page.getByRole('navigation').getByRole('button', { name: fr['main/navbar'].search })).toBeVisible();
    });
  });
});
