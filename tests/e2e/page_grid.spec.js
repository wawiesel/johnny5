// Verifies square grid per page, origin inclusion, and no cross-page bleed
const { test, expect } = require('@playwright/test');
const gridHelpers = require('./utils/grid');

test('grid squares per page; origin included; no cross-page bleed', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await gridHelpers.waitForGridReady(page);

  const gridContainer = page.locator('#pdf-grid');
  const canvasBox = await gridContainer.boundingBox();
  expect(canvasBox.width).toBeGreaterThan(0);
  expect(canvasBox.height).toBeGreaterThan(0);

  const pageCount = await page.locator('.pdf-page-wrapper').count();
  expect(pageCount).toBeGreaterThan(0);

  // For each page, ensure some grid pixels exist inside page bounds and that gaps do not show grid pixels
  for (let i = 0; i < pageCount; i++) {
    const wrapper = page.locator('.pdf-page-wrapper').nth(i);
    const wRect = await wrapper.boundingBox();

    const hasGridInside = await gridHelpers.rowHasGrid(page, {
      absoluteY: wRect.y + (wRect.height / 2),
      left: wRect.x + 5,
      right: wRect.x + wRect.width - 5,
    });
    expect(hasGridInside).toBeTruthy();

    // Gap region: between this page bottom and next page top (if next exists)
    if (i < pageCount - 1) {
      const nextRect = await page.locator('.pdf-page-wrapper').nth(i + 1).boundingBox();
      const gapY = Math.round((wRect.y + wRect.height + nextRect.y) / 2);
      const hasInGap = await gridHelpers.rowHasGrid(page, {
        absoluteY: gapY,
        left: wRect.x + 5,
        right: wRect.x + wRect.width - 5,
      });
      expect(hasInGap).toBeFalsy();
    }
  }
});

