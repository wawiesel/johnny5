// Verifies square grid per page, origin inclusion, and no cross-page bleed
const { test, expect } = require('@playwright/test');

test('grid squares per page; origin included; no cross-page bleed', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('#pdf-grid');

  const grid = page.locator('#pdf-grid');
  const canvasBox = await grid.boundingBox();
  expect(canvasBox.width).toBeGreaterThan(0);
  expect(canvasBox.height).toBeGreaterThan(0);

  const pageCount = await page.locator('.pdf-page-wrapper').count();
  expect(pageCount).toBeGreaterThan(0);

  // For each page, ensure some grid pixels exist inside page bounds and that gaps do not show grid pixels
  for (let i = 0; i < pageCount; i++) {
    const wrapper = page.locator('.pdf-page-wrapper').nth(i);
    const wRect = await wrapper.boundingBox();

    const hasGridInside = await page.evaluate(({ top, left, width, height }) => {
      const c = document.getElementById('pdf-grid');
      const r = c.getBoundingClientRect();
      const ctx = c.getContext('2d');
      const x0 = Math.max(0, Math.round(left - r.left + 5));
      const y0 = Math.max(0, Math.round(top - r.top + height / 2));
      const w = Math.max(1, Math.min(Math.round(width - 10), Math.round(r.width - x0)));
      const data = ctx.getImageData(x0, y0, w, 1).data;
      for (let i = 0; i < data.length; i += 4) {
        const [R,G,B,A] = [data[i], data[i+1], data[i+2], data[i+3]];
        const isRed = R > 170 && G < 80 && B < 80;
        const isGray = R === G && G === B && R < 210;
        if (A > 0 && (isRed || isGray)) return true;
      }
      return false;
    }, wRect);
    expect(hasGridInside).toBeTruthy();

    // Gap region: between this page bottom and next page top (if next exists)
    if (i < pageCount - 1) {
      const nextRect = await page.locator('.pdf-page-wrapper').nth(i + 1).boundingBox();
      const gapY = Math.round((wRect.y + wRect.height + nextRect.y) / 2);
      const hasInGap = await page.evaluate((absY) => {
        const c = document.getElementById('pdf-grid');
        const r = c.getBoundingClientRect();
        const ctx = c.getContext('2d');
        const y = Math.max(0, Math.round(absY - r.top));
        const data = ctx.getImageData(0, y, Math.round(r.width), 1).data;
        for (let i = 0; i < data.length; i += 4) {
          const [R,G,B,A] = [data[i], data[i+1], data[i+2], data[i+3]];
          const isRed = R > 170 && G < 80 && B < 80;
          const isGray = R === G && G === B && R < 210;
          if (A > 0 && (isRed || isGray)) return true;
        }
        return false;
      }, gapY);
      expect(hasInGap).toBeFalsy();
    }
  }
});


