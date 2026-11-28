import { test, expect } from '@playwright/test';

test.describe('Search Results - Card Expansion & Inside-Scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('bibleit:ui:active_tab', 'search');
      localStorage.setItem(
        'bibleit:ui:last_search',
        JSON.stringify({
          query: 'love your neighbor',
          passages: [
            {
              chunk: {
                id: 1,
                book: 'ROM',
                start: [13, 8],
                end: [13, 14],
                headings: [[13, 8, 'Love Fulfills the Law']],
                text: 'Owe no one anything, except to love one another; for he who loves his neighbor has fulfilled the law. For the commandments, "You shall not commit adultery," "You shall not murder," "You shall not steal," "You shall not covet," and whatever other commandments there are, are all summed up in this saying, namely, "You shall love your neighbor as yourself." Love does no harm to a neighbor. Love therefore is the fulfillment of the law.',
              },
              score: 0.95,
              source: 'semantic',
            },
            {
              chunk: {
                id: 2,
                book: 'MAT',
                start: [22, 36],
                end: [22, 40],
                headings: [[22, 36, 'The Greatest Commandment']],
                text: '"Teacher, which is the greatest commandment in the law?" Jesus said to him, "\'You shall love the Lord your God with all your heart, with all your soul, and with all your mind.\' This is the first and great commandment. A second likewise is this: \'You shall love your neighbor as yourself.\' The whole law and the prophets depend on these two commandments."',
              },
              score: 0.88,
              source: 'semantic',
            },
          ],
          answerText: '',
        }),
      );
    });

    await page.goto('/');
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('collapses cards by default and expands with inside-scroll on click', async ({ page }) => {
    const card1 = page.locator('article').nth(0);
    const textContainer = card1.locator('div.relative.font-serif');

    // 1. Initially collapsed with max-h-36 and overflow-hidden
    await expect(textContainer).toHaveClass(/max-h-36/);
    await expect(textContainer).toHaveClass(/overflow-hidden/);

    const expandBtn = card1.getByRole('button', { name: '+ Expand passage' });
    await expect(expandBtn).toBeVisible();

    // 2. Click expand
    await expandBtn.click();

    // 3. Card text expands to max-h-96 with inside scroll (overflow-y-auto)
    await expect(textContainer).toHaveClass(/max-h-96/);
    await expect(textContainer).toHaveClass(/overflow-y-auto/);
    await expect(card1.getByRole('button', { name: '– Collapse passage' })).toBeVisible();
  });

  test('guarantees only one card is expanded at a time across multiple results', async ({ page }) => {
    const card1 = page.locator('article').nth(0);
    const card2 = page.locator('article').nth(1);

    const text1 = card1.locator('div.relative.font-serif');
    const text2 = card2.locator('div.relative.font-serif');

    // Both cards collapsed initially
    await expect(text1).toHaveClass(/max-h-36/);
    await expect(text2).toHaveClass(/max-h-36/);

    // 1. Expand Card 1
    await card1.getByRole('button', { name: '+ Expand passage' }).click();
    await expect(text1).toHaveClass(/max-h-96/);
    await expect(text2).toHaveClass(/max-h-36/);

    // 2. Expand Card 2 -> Card 1 MUST collapse!
    await card2.getByRole('button', { name: '+ Expand passage' }).click();
    await expect(text1).toHaveClass(/max-h-36/);
    await expect(text2).toHaveClass(/max-h-96/);
  });

  test('displays section headings inline above their respective verses', async ({ page }) => {
    const card1 = page.locator('article').nth(0);
    // Heading is rendered inline inside the text container above verse 8-14
    await expect(card1.getByText('Love Fulfills the Law')).toBeVisible();
    await expect(card1.getByText('8–14', { exact: true })).toBeVisible();
  });

  test('shows guidance panel only while search input has focus and hides it on blur', async ({ page }) => {
    const input = page.getByRole('textbox');

    // Existing search results: panel starts hidden while input is unfocused
    await expect(page.getByText('Popular Topics')).toBeHidden();

    // Focusing input opens the panel
    await input.click();
    await expect(page.getByText('Popular Topics')).toBeVisible();

    // Clicking a suggestion chip populates input without premature blur closing the panel
    const chip = page.getByRole('button', { name: 'Strength and courage' });
    await chip.click();
    await expect(input).toHaveValue('Strength and courage');
    await expect(input).toBeFocused();
    await expect(page.getByText('Popular Topics')).toBeVisible();

    // Clicking outside blurs the input and hides the panel immediately
    await page.locator('header').click();
    await expect(input).not.toBeFocused();
    await expect(page.getByText('Popular Topics')).toBeHidden();
  });

  test('submits end-of-results search feedback and displays toast confirmation', async ({ page }) => {
    await expect(page.getByText('Did these passages answer your search?')).toBeVisible();
    const yesBtn = page.getByRole('button', { name: 'Yes, helpful' });
    await expect(yesBtn).toBeVisible();
    await yesBtn.click();
    await expect(page.getByText('Thank you for your feedback!')).toBeVisible();
    await expect(page.getByText('Did these passages answer your search?')).toBeHidden();
  });
});
