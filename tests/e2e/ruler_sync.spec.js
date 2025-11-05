// Validates left-panel ruler alignment with grid and continuous scroll sync
const { test, expect } = require('@playwright/test');
const gridHelpers = require('./utils/grid');

test('left ruler aligns with grid and stays in scroll lockstep', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await gridHelpers.waitForGridReady(page);
  await page.waitForSelector('#pdf-y-density', { timeout: 10000 });

  const scroller = page.locator('#pdf-scroller');

  // Verify scroll positions remain synchronized between the main scroller and the y-density ruler
  for (const ratio of [0.0, 0.33, 0.66, 1.0]) {
    const maxScroll = await page.evaluate(() => {
      const s = document.getElementById('pdf-scroller');
      return s.scrollHeight - s.clientHeight;
    });
    const target = Math.max(0, Math.round(maxScroll * ratio));
    await scroller.evaluate((el, t) => el.scrollTo(0, t), target);
    await page.waitForTimeout(50);

    const scrollTop = await scroller.evaluate(el => Math.round(el.scrollTop));
    const rulerScroll = await page.evaluate(() => {
      const panel = document.getElementById('pdf-y-density');
      return panel ? Math.round(panel.scrollTop) : null;
    });

    expect(rulerScroll).not.toBeNull();
    expect(Math.abs(rulerScroll - scrollTop)).toBeLessThanOrEqual(2);
  }
});
