// Verifies indicator layout using a minimal static HTML with inlined CSS (no server)
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('indicators are square and no horizontal gaps (no borders)', async ({ page }) => {
  const cssPath = path.join(__dirname, '../../src/johnny5/web/static/app.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  const html = `
    <!doctype html>
    <meta charset="utf-8">
    <style>${css}</style>
    <div class="app-container">
      <div id="indicator-i" class="box">i</div>
      <div id="x-density" class="box"></div>
      <div id="indicator-d" class="box">d</div>
      <div id="indicator-e" class="box">e</div>
      <div class="center-divider"></div>
      <div id="pdf-viewer" class="box"></div>
      <div id="indicator-r" class="box">r</div>
      <div id="y-density" class="box"></div>
      <div id="annotations" class="box"></div>
      <div id="toggles" class="box"></div>
      <div id="options" class="box"></div>
      <div id="log" class="box"></div>
      <div id="x-density-right" class="box"></div>
      <div id="reconstructed" class="box"></div>
      <div id="y-density-right" class="box"></div>
      <div id="options-right" class="box"></div>
      <div id="log-right" class="box"></div>
    </div>`;

  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  // Compute sizes for each indicator
  const ids = ['#indicator-i', '#indicator-d', '#indicator-e', '#indicator-r'];
  for (const sel of ids) {
    const box = await page.locator(sel).boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(0); // must be exact squares
  }

  // Ensure there is no horizontal column gap (which would show black borders)
  const columnGap = await page.locator('.app-container').evaluate(el => getComputedStyle(el).columnGap);
  expect(columnGap).toBe('0px');
});


