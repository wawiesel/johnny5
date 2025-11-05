// Verifies one X and one Y axis per page pass exactly through the origin
const { test, expect } = require('@playwright/test');
const gridHelpers = require('./utils/grid');

test('per-page axes pass exactly through the origin', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');

  await gridHelpers.waitForGridReady(page);

  const pageCount = await page.locator('.pdf-page-wrapper').count();
  expect(pageCount).toBeGreaterThan(0);

  for (let i = 0; i < pageCount; i++) {
    const wrapper = page.locator('.pdf-page-wrapper').nth(i);
    const origin = wrapper.locator('.origin-marker');
    await expect(origin).toBeVisible();

    const originRect = await origin.boundingBox();
    const centerX = originRect.x + originRect.width / 2;
    const centerY = originRect.y + originRect.height / 2;

    const verticalLine = await gridHelpers.findVerticalGridLine(page, {
      searchLeft: centerX - 20,
      searchRight: centerX + 20,
    });
    const horizontalLine = await gridHelpers.findHorizontalGridLine(page, {
      searchTop: centerY - 20,
      searchBottom: centerY + 20,
    });
    expect(verticalLine).not.toBeNull();
    expect(horizontalLine).not.toBeNull();
  }
});
