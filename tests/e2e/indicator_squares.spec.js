// Verifies indicator layout on the live app (top-row squares, zero gaps)
const { test, expect } = require('@playwright/test');

test('top-row indicators remain square and column gap is zero', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('#pdf-grid'); // ensure app bootstrapped

  // Wait for all indicators to appear
  const squareSelectors = ['#color-mode-selector', '#rec-indicator'];
  for (const sel of squareSelectors) {
    await page.waitForSelector(sel, { timeout: 10000 });
  }

  const squareBoxes = await page.evaluate((selectors) => {
    return selectors.map(sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        selector: sel,
        width: rect.width,
        height: rect.height,
      };
    });
  }, squareSelectors);

  for (const box of squareBoxes) {
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
  }

  // All indicators should share the same size (within 1px)
  const baseSize = Math.round(squareBoxes[0].height);
  for (const box of squareBoxes.slice(1)) {
    expect(Math.abs(Math.round(box.height) - baseSize)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.round(box.width) - baseSize)).toBeLessThanOrEqual(1);
  }

  // The center progress block should align to the same topbar height
  const progressHeight = await page.evaluate(() => {
    const el = document.querySelector('#ann-progress');
    return el ? Math.round(el.getBoundingClientRect().height) : 0;
  });
  expect(progressHeight).toBeGreaterThan(0);
  expect(Math.abs(progressHeight - baseSize)).toBeLessThanOrEqual(1);

  // The layout grid must not introduce column gaps
  const columnGap = await page.evaluate(() => {
    const container = document.querySelector('.app-container');
    return container ? getComputedStyle(container).columnGap : null;
  });
  expect(columnGap).toBe('0px');
});
