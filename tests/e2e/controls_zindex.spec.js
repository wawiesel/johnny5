// Ensures zoom controls are always on top of overlays/grid
const { test, expect } = require('@playwright/test');

test('zoom controls are always the top interactive layer', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('.pdf-controls-overlay');
  await page.waitForSelector('#pdf-grid');

  const controls = page.locator('.pdf-controls-overlay');
  const btn = controls.locator('#zoom-in');
  await expect(btn).toBeVisible();

  // Try to click through; should succeed even if overlays exist beneath
  await btn.click();

  // Validate scale changed
  const level = await page.locator('#zoom-level').innerText();
  expect(level).not.toBe('100%');
});


