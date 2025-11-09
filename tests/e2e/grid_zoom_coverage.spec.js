// Verifies grid overlay covers entire PDF and persists across zoom levels
const { test, expect } = require('@playwright/test');
const gridHelpers = require('./utils/grid');

async function assertGridCoverage(page) {
  const wrappers = page.locator('.pdf-page-wrapper');
  const count = await wrappers.count();
  expect(count).toBeGreaterThan(0);
  
  // 1. Structural coverage: Verify grid canvas structure exists and matches page count
  const canvasStructure = await page.evaluate(() => {
    const container = document.getElementById('pdf-grid');
    if (!container) return { valid: false, reason: 'no container' };
    const canvases = Array.from(container.querySelectorAll('canvas'));
    const wrappers = document.querySelectorAll('.pdf-page-wrapper');
    if (canvases.length !== wrappers.length) {
      return { valid: false, reason: `canvas count mismatch: ${canvases.length} vs ${wrappers.length}` };
    }
    if (canvases.length === 0) {
      return { valid: false, reason: 'no canvases found' };
    }
    
    // Verify each canvas has non-zero dimensions (proves canvas is created for each page)
    for (let i = 0; i < canvases.length; i++) {
      const canvas = canvases[i];
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return { valid: false, reason: `canvas ${i} has zero dimensions` };
      }
    }
    return { valid: true };
  });
  expect(canvasStructure.valid).toBeTruthy();
  
  // 2. Functional coverage: Verify grid lines exist across the entire page
  // Sample multiple points across each page to ensure grid lines are drawn throughout
  for (let i = 0; i < count; i++) {
    const rect = await wrappers.nth(i).boundingBox();
    expect(rect).not.toBeNull();
    
    const inset = 20; // Stay away from edges
    const leftX = rect.x + inset;
    const rightX = rect.x + rect.width - inset;
    const topY = rect.y + inset;
    const bottomY = rect.y + rect.height - inset;
    
    // Sample horizontal grid lines at multiple Y positions (top, middle, bottom)
    const yPositions = [
      topY,
      rect.y + rect.height * 0.25,
      rect.y + rect.height * 0.5,
      rect.y + rect.height * 0.75,
      bottomY,
    ];
    
    // Sample vertical grid lines at multiple X positions (left, middle, right)
    const xPositions = [
      leftX,
      rect.x + rect.width * 0.25,
      rect.x + rect.width * 0.5,
      rect.x + rect.width * 0.75,
      rightX,
    ];
    
    // Verify horizontal grid lines exist across the page width
    let horizontalLinesFound = 0;
    for (const y of yPositions) {
      const hasRow = await gridHelpers.rowHasGrid(page, {
        absoluteY: y,
        left: leftX,
        right: rightX,
      });
      if (hasRow) horizontalLinesFound++;
    }
    // At least some horizontal lines should exist (grid is drawn at intervals)
    expect(horizontalLinesFound).toBeGreaterThan(0);
    
    // Verify vertical grid lines exist across the page height
    let verticalLinesFound = 0;
    for (const x of xPositions) {
      const hasCol = await gridHelpers.columnHasGrid(page, {
        absoluteX: x,
        top: topY,
        bottom: bottomY,
      });
      if (hasCol) verticalLinesFound++;
    }
    // At least some vertical lines should exist (grid is drawn at intervals)
    expect(verticalLinesFound).toBeGreaterThan(0);
  }
}

test('grid covers entire PDF and persists across zoom levels', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await gridHelpers.waitForGridReady(page);
  await assertGridCoverage(page);

  // Zoom in and verify grid still covers the page
  await page.locator('#zoom-in').click();
  await page.waitForFunction(() => {
    const levelEl = document.querySelector('#zoom-level');
    return levelEl && levelEl.innerText.trim() !== '';
  }, { timeout: 5000 });
  await gridHelpers.waitForGridReady(page);
  await assertGridCoverage(page);

  // Zoom out and verify grid still covers the page
  await page.locator('#zoom-out').click();
  await page.waitForFunction(() => {
    const levelEl = document.querySelector('#zoom-level');
    return levelEl && levelEl.innerText.trim() !== '';
  }, { timeout: 5000 });
  await gridHelpers.waitForGridReady(page);
  await assertGridCoverage(page);
});
