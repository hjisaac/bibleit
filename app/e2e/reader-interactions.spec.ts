import { test, expect } from '@playwright/test';

test.describe('Reader View Interactions', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to reader tab by default
    await page.addInitScript(() => {
      localStorage.setItem('bibleit_active_tab', 'reader');
      localStorage.setItem(
        'bibleit_last_read',
        JSON.stringify({ book: 'GEN', chapter: 1, targetVerse: 1 }),
      );
    });
    await page.goto('/');
    // Ensure the chapter header and verses are loaded
    await expect(page.locator('h1')).toContainText('Genesis Chapter 1');
    await expect(page.locator('#verse-1')).toBeVisible();
  });

  test('Bug 1 regression: First tap/click immediately applies yellow border', async ({ page }) => {
    const verse1 = page.locator('#verse-1');

    // Initially, verse 1 should not have the ring highlight
    await expect(verse1).not.toHaveClass(/ring-2 ring-amber-500\/50/);

    // Tap/click once on the verse
    await verse1.click();

    // Verify the yellow border appears immediately on the very first click
    await expect(verse1).toHaveClass(/ring-2 ring-amber-500\/50/);

    // Clicking again deselects the verse and removes the ring
    await verse1.click();
    await expect(verse1).not.toHaveClass(/ring-2 ring-amber-500\/50/);
  });

  test('Bug 2 regression: Long press displays action buttons and they remain visible upon release', async ({ page }) => {
    const verse2 = page.locator('#verse-2');

    // Perform long-press: mouse down and hold past the 400ms threshold
    const box = await verse2.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(500);
      await page.mouse.up();
    }

    // Action buttons must appear
    const copyButton = page.getByRole('button', { name: 'Copy' });
    const saveButton = page.getByRole('button', { name: /^(Save|Unsave)$/ });
    await expect(copyButton).toBeVisible();
    await expect(saveButton).toBeVisible();

    // Releasing finger/mouse must NOT dismiss the buttons (no flicker or self-dismiss)
    await page.waitForTimeout(300);
    await expect(copyButton).toBeVisible();
    await expect(saveButton).toBeVisible();
  });

  test('Saved verse enters reader quietly and displays Unsave upon long-press', async ({ page }) => {
    // Seed localStorage with verse 3 saved
    await page.addInitScript(() => {
      localStorage.setItem(
        'bibleit_saved_verses',
        JSON.stringify([
          {
            book: 'GEN',
            bookName: 'Genesis',
            chapter: 1,
            verse: 3,
            citation: 'Genesis 1:3',
            text: 'God said, "Let there be light," and there was light.',
          },
        ]),
      );
    });
    await page.reload();
    await expect(page.locator('#verse-3')).toBeVisible();

    // Saved verse enters quietly without action buttons open
    const unsaveButton = page.getByRole('button', { name: 'Unsave' });
    await expect(unsaveButton).not.toBeVisible();

    // Long press on saved verse 3 triggers the action buttons
    await page.locator('#verse-3').dispatchEvent('contextmenu');

    // Unsave button is now visible
    await expect(unsaveButton).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
  });

  test('Toggles button label between "Save" and "Unsave" dynamically on the same verse', async ({ page }) => {
    const verse4 = page.locator('#verse-4');
    await expect(verse4).toBeVisible();

    // 1. Long-press unsaved verse 4
    await verse4.dispatchEvent('contextmenu');

    // Button should initially be "Save"
    const saveButton = page.getByRole('button', { name: 'Save', exact: true });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toHaveText('Save');

    // 2. Click "Save"
    await saveButton.click();

    // Action bar closes after saving
    await expect(saveButton).not.toBeVisible();

    // 3. Long-press the SAME verse 4 again
    await verse4.dispatchEvent('contextmenu');

    // Button MUST now toggle to "Unsave"!
    const unsaveButton = page.getByRole('button', { name: 'Unsave', exact: true });
    await expect(unsaveButton).toBeVisible();
    await expect(unsaveButton).toHaveText('Unsave');

    // 4. Click "Unsave"
    await unsaveButton.click();

    // Action bar closes after unsaving
    await expect(unsaveButton).not.toBeVisible();

    // 5. Long-press the SAME verse 4 a third time
    await verse4.dispatchEvent('contextmenu');

    // Button MUST now toggle back to "Save"!
    const saveButtonAgain = page.getByRole('button', { name: 'Save', exact: true });
    await expect(saveButtonAgain).toBeVisible();
    await expect(saveButtonAgain).toHaveText('Save');
  });
});

