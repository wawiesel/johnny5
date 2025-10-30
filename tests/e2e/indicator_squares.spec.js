// Ensures indicator boxes (i, d, e, r) are perfect squares
const { test, expect } = require('@playwright/test');

test('indicator boxes are square and right width equals top height', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');

  const ids = ['#indicator-i', '#indicator-d', '#indicator-e', '#indicator-r'];
  for (const sel of ids) {
    await page.waitForSelector(sel);
    const box = await page.locator(sel).boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    // Allow 1px tolerance for fractional/layout rounding
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
  }

  // Additionally assert that the right-most indicator's width equals the top row height
  const topRowHeight = await page.evaluate(() => {
    const el = document.querySelector('#indicator-i');
    return el ? Math.round(el.getBoundingClientRect().height) : 0;
  });
  const rightWidth = await page.evaluate(() => {
    const el = document.querySelector('#indicator-r');
    return el ? Math.round(el.getBoundingClientRect().width) : 0;
  });
  expect(topRowHeight).toBeGreaterThan(0);
  expect(rightWidth).toBeGreaterThan(0);
  expect(Math.abs(topRowHeight - rightWidth)).toBeLessThanOrEqual(1);
});


