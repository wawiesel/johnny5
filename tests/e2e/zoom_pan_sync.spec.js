// Verifies pan and zoom synchronization across grid and left ruler
const { test, expect } = require('@playwright/test');
const gridHelpers = require('./utils/grid');

test('pan and zoom keep grid and ruler synchronized', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await gridHelpers.waitForGridReady(page);
  await page.waitForSelector('#pdf-y-density', { timeout: 10000 });
  const scroller = page.locator('#pdf-scroller');

  const initialLine = await gridHelpers.findHorizontalGridLine(page);
  expect(initialLine).not.toBeNull();

  const scrollOffsets = [0, 0.33, 0.66, 1.0];
  for (const ratio of scrollOffsets) {
    const target = await page.evaluate((r) => {
      const s = document.getElementById('pdf-scroller');
      if (!s) return 0;
      const max = s.scrollHeight - s.clientHeight;
      return Math.max(0, Math.round(max * r));
    }, ratio);
    await scroller.evaluate((el, t) => el.scrollTo(0, t), target);
    await page.waitForFunction(() => {
      const s = document.getElementById('pdf-scroller');
      const p = document.getElementById('pdf-y-density');
      return s && p && Math.abs(p.scrollTop - s.scrollTop) <= 10;
    }, { timeout: 2000 });

    const expectedScroll = await scroller.evaluate(el => Math.round(el.scrollTop));
    const rulerScroll = await page.evaluate(() => {
      const panel = document.getElementById('pdf-y-density');
      return panel ? Math.round(panel.scrollTop) : null;
    });
    expect(rulerScroll).not.toBeNull();
    // Allow up to 10px tolerance for scroll sync (browser rounding, subpixel rendering)
    expect(Math.abs(rulerScroll - expectedScroll)).toBeLessThanOrEqual(10);
  }

  await page.locator('#zoom-in').click();
  await gridHelpers.waitForGridReady(page);
  await page.waitForFunction(() => {
    const s = document.getElementById('pdf-scroller');
    const p = document.getElementById('pdf-y-density');
    return s && p && Math.abs(p.scrollTop - s.scrollTop) <= 5;
  }, { timeout: 2000 });

  const hasOrigins = await page.evaluate(() => {
    const wrappers = document.querySelectorAll('.pdf-page-wrapper');
    return wrappers.length > 0 && Array.from(wrappers).every(w => w.querySelector('.origin-marker'));
  });
  expect(hasOrigins).toBeTruthy();
});
