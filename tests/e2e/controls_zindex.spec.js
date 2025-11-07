// Ensures zoom controls are always on top of overlays/grid
const { test, expect } = require('@playwright/test');

test('zoom controls are always the top interactive layer', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('.pdf-controls-overlay #zoom-in', { timeout: 10000 });
  
  const initialLevel = await page.locator('#zoom-level').innerText();
  await page.locator('.pdf-controls-overlay #zoom-in').click();
  
  // Wait for zoom level to actually change
  await page.waitForFunction(
    (prevLevel) => {
      const levelEl = document.querySelector('#zoom-level');
      return levelEl && levelEl.innerText !== prevLevel;
    },
    initialLevel,
    { timeout: 5000 }
  );
  
  const level = await page.locator('#zoom-level').innerText();
  expect(level).not.toBe('100%');
});
