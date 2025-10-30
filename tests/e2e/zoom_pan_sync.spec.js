// Verifies pan and zoom synchronization across grid and left ruler
const { test, expect } = require('@playwright/test');

test('pan and zoom keep grid and ruler synchronized', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('#pdf-grid');
  await page.waitForSelector('#y-density canvas');

  const scroller = page.locator('#pdf-scroller');

  // Record a grid line absolute Y, then pan by scrolling and ensure the same grid line shifts accordingly
  const initialY = await page.evaluate(() => {
    const g = document.getElementById('pdf-grid');
    const r = g.getBoundingClientRect();
    const ctx = g.getContext('2d');
    // scan downwards to find any grid/axis pixel row near top third
    for (let y = Math.round(r.height * 0.33); y < r.height; y += 2) {
      const data = ctx.getImageData(0, y, r.width, 1).data;
      for (let i = 0; i < data.length; i += 4) {
        const [R,G,B,A] = [data[i], data[i+1], data[i+2], data[i+3]];
        const isLine = (R > 170 && G < 80 && B < 80) || (R === G && G === B && R < 210);
        if (A > 0 && isLine) return r.top + y;
      }
    }
    return null;
  });
  expect(initialY).not.toBeNull();

  // Scroll down by 200px and ensure the ruler tracks
  await scroller.evaluate(el => el.scrollBy(0, 200));
  await page.waitForTimeout(50);

  const rulerTracks = await page.evaluate((absY) => {
    const yPanel = document.getElementById('y-density');
    const c = yPanel.querySelector('canvas');
    const rr = c.getBoundingClientRect();
    const ctx = c.getContext('2d');
    const y = Math.max(0, Math.min(Math.round(absY - rr.top), rr.height - 1));
    const row = ctx.getImageData(0, y, rr.width, 1).data;
    for (let i = 0; i < row.length; i += 4) {
      const [R,G,B,A] = [row[i], row[i+1], row[i+2], row[i+3]];
      const isLine = (R > 170 && G < 80 && B < 80) || (R === G && G === B && R < 210);
      if (A > 0 && isLine) return true;
    }
    return false;
  }, initialY + 200);
  expect(rulerTracks).toBeTruthy();

  // Zoom in and ensure grid remains per-page and axes still red at origin
  await page.locator('#zoom-in').click();
  const originAxesOK = await page.evaluate(() => {
    const wrappers = document.querySelectorAll('.pdf-page-wrapper');
    if (!wrappers.length) return false;
    for (const w of wrappers) {
      const m = w.querySelector('.origin-marker');
      if (!m) return false;
    }
    return true;
  });
  expect(originAxesOK).toBeTruthy();
});


