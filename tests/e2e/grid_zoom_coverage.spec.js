// Verifies that the grid overlay covers the entire PDF image at different zoom levels
const { test, expect } = require('@playwright/test');
const gridHelpers = require('./utils/grid');

async function waitForGridStable(page) {
  await gridHelpers.waitForGridReady(page);
  await page.waitForFunction(() => {
    const wrappers = document.querySelectorAll('.pdf-page-wrapper');
    const canvases = document.querySelectorAll('#pdf-grid canvas');
    return wrappers.length > 0 && canvases.length === wrappers.length;
  }, { timeout: 10000 });
}

async function assertGridCoverage(page) {
  const wrappers = page.locator('.pdf-page-wrapper');
  const count = await wrappers.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const rect = await wrappers.nth(i).boundingBox();
    expect(rect).not.toBeNull();
    const inset = 4;
    const topY = rect.y + inset;
    const bottomY = rect.y + rect.height - inset;
    const leftX = rect.x + inset;
    const rightX = rect.x + rect.width - inset;
    const midX = rect.x + rect.width / 2;
    const midY = rect.y + rect.height / 2;

    const topHas = await gridHelpers.rowHasGrid(page, {
      absoluteY: topY,
      left: leftX,
      right: rightX,
    });
    const bottomHas = await gridHelpers.rowHasGrid(page, {
      absoluteY: bottomY,
      left: leftX,
      right: rightX,
    });
    const leftHas = await gridHelpers.columnHasGrid(page, {
      absoluteX: leftX,
      top: topY,
      bottom: bottomY,
    });
    const rightHas = await gridHelpers.columnHasGrid(page, {
      absoluteX: rightX,
      top: topY,
      bottom: bottomY,
    });
    const centerHas = await gridHelpers.hasGridPixel(page, { x: midX, y: midY, padding: 4 });

    expect(topHas).toBeTruthy();
    expect(bottomHas).toBeTruthy();
    expect(leftHas).toBeTruthy();
    expect(rightHas).toBeTruthy();
    expect(centerHas).toBeTruthy();
  }
}

async function changeZoom(page, direction, clicks) {
  const control = page.locator(direction === 'in' ? '#zoom-in' : '#zoom-out');
  for (let i = 0; i < clicks; i++) {
    await control.click();
    await page.waitForTimeout(150);
    await waitForGridStable(page);
  }
}

test('grid covers entire PDF at different zoom levels', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await waitForGridStable(page);
  await assertGridCoverage(page);

  await changeZoom(page, 'in', 2);
  await assertGridCoverage(page);

  await changeZoom(page, 'out', 4);
  await assertGridCoverage(page);
});
