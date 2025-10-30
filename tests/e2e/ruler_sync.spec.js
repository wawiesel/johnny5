// Validates left-panel ruler alignment with grid and continuous scroll sync
const { test, expect } = require('@playwright/test');

test('left ruler aligns with grid and stays in scroll lockstep', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('#pdf-grid');
  await page.waitForSelector('#y-density canvas');

  // Helper to probe for any grid/ruler line at absolute Y
  async function hasLineAtAbsoluteY(page, absY) {
    return page.evaluate((absY) => {
      const grid = document.getElementById('pdf-grid');
      const r = grid.getBoundingClientRect();
      const ctx = grid.getContext('2d');
      const y = Math.max(0, Math.min(Math.round(absY - r.top), r.height - 1));
      const row = ctx.getImageData(0, y, r.width, 1).data;
      for (let i = 0; i < row.length; i += 4) {
        const [R,G,B,A] = [row[i], row[i+1], row[i+2], row[i+3]];
        const isGrid = (R > 170 && G < 80 && B < 80) || (R === G && G === B && R < 210);
        if (A > 0 && isGrid) return true;
      }
      return false;
    }, absY);
  }

  const scroller = page.locator('#pdf-scroller');
  const ruler = page.locator('#y-density canvas');
  const rulerBox = await ruler.boundingBox();

  // Sample a few scroll positions and verify a detected grid line also exists on the ruler at same absolute Y
  for (const ratio of [0.0, 0.33, 0.66, 1.0]) {
    const maxScroll = await page.evaluate(() => {
      const s = document.getElementById('pdf-scroller');
      return s.scrollHeight - s.clientHeight;
    });
    const target = Math.max(0, Math.round(maxScroll * ratio));
    await scroller.evaluate((el, t) => el.scrollTo(0, t), target);
    await page.waitForTimeout(50);

    // Choose a Y in the middle of the viewport
    const midAbsY = (await scroller.boundingBox()).y + (await scroller.boundingBox()).height / 2;
    const gridHas = await hasLineAtAbsoluteY(page, midAbsY);

    const rulerHas = await page.evaluate((absY) => {
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
    }, midAbsY);

    expect(gridHas).toBeTruthy();
    expect(rulerHas).toBeTruthy();
  }
});


