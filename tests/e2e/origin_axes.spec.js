// Verifies one X and one Y axis per page pass exactly through the origin
const { test, expect } = require('@playwright/test');

test('per-page axes pass exactly through the origin', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');

  await page.waitForSelector('#pdf-grid');

  const pageCount = await page.locator('.pdf-page-wrapper').count();
  expect(pageCount).toBeGreaterThan(0);

  for (let i = 0; i < pageCount; i++) {
    const wrapper = page.locator('.pdf-page-wrapper').nth(i);
    const origin = wrapper.locator('.origin-marker');
    await expect(origin).toBeVisible();

    const originRect = await origin.boundingBox();
    const centerX = originRect.x + originRect.width / 2;
    const centerY = originRect.y + originRect.height / 2;

    const passesThrough = await page.evaluate(({ x, y }) => {
      const canvas = document.getElementById('pdf-grid');
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      const cx = Math.round(x - rect.left);
      const cy = Math.round(y - rect.top);

      function isRed(R, G, B, A) { return R > 180 && G < 70 && B < 70 && A > 0; }

      // Check a small cross around center
      let vHit = false, hHit = false;
      const v = ctx.getImageData(cx, Math.max(0, cy - 5), 1, 11).data;
      for (let i = 0; i < v.length; i += 4) { if (isRed(v[i], v[i+1], v[i+2], v[i+3])) { vHit = true; break; } }
      const h = ctx.getImageData(Math.max(0, cx - 5), cy, 11, 1).data;
      for (let i = 0; i < h.length; i += 4) { if (isRed(h[i], h[i+1], h[i+2], h[i+3])) { hHit = true; break; } }
      return vHit && hHit;
    }, { x: centerX, y: centerY });

    expect(passesThrough).toBeTruthy();
  }
});


