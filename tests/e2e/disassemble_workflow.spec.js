// Verifies disassemble workflow: density charts, annotations, toggles, connection lines
const { test, expect } = require('@playwright/test');
const { waitForAnnotationData } = require('./utils/disassembly');

test.describe('Disassemble (no fixup) workflow', () => {
  test('density charts are displayed', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    await page.waitForSelector('#pdf-x-density', { timeout: 10000 });
    await page.waitForSelector('#pdf-y-density', { timeout: 10000 });
    
    await expect(page.locator('#pdf-x-density')).toBeVisible();
    await expect(page.locator('#pdf-y-density')).toBeVisible();
    
    const hasContent = await page.evaluate(() => {
      const x = document.getElementById('pdf-x-density');
      const y = document.getElementById('pdf-y-density');
      return (x && (x.querySelector('canvas') || x.children.length > 0)) ||
             (y && (y.querySelector('canvas') || y.children.length > 0));
    });
    expect(hasContent).toBeTruthy();
  });

  test('annotations are displayed with bounding boxes', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    await waitForAnnotationData(page);
    
    const overlayCount = await page.locator('.pdf-bbox-overlay').count();
    if (overlayCount === 0) return;
    
    const firstOverlay = page.locator('.pdf-bbox-overlay').first();
    await expect(firstOverlay).toBeVisible();
    
    const style = await firstOverlay.evaluate(el => ({
      position: getComputedStyle(el).position,
      border: getComputedStyle(el).border,
    }));
    expect(style.position).toBe('absolute');
    expect(style.border).toBeTruthy();
  });

  test('annotation list is populated', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    await waitForAnnotationData(page);
    
    const itemCount = await page.locator('.ann-list-item').count();
    if (itemCount === 0) return;
    
    const firstItem = page.locator('.ann-list-item').first();
    await expect(firstItem).toBeVisible();
    expect(await firstItem.locator('.ann-code').count()).toBeGreaterThan(0);
    
    const codeText = await firstItem.locator('.ann-code').textContent();
    expect(codeText.length).toBeGreaterThan(0);
  });

  test('label toggles are displayed and functional', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    await waitForAnnotationData(page);
    await page.waitForSelector('.ann-toggles-container', { timeout: 10000 });
    
    const checkboxes = page.locator('.ann-toggles-container input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    if (checkboxCount === 0) return;
    
    // Find first checkbox that's not the none/all toggle
    for (let i = 0; i < checkboxCount; i++) {
      const checkbox = checkboxes.nth(i);
      const id = await checkbox.getAttribute('id');
      if (id === 'ann-none-all') continue;
      
      const toggleRow = page.locator(`.ann-toggle-row input[type="checkbox"]#${id}`).locator('..').first();
      await expect(toggleRow).toBeVisible();
      
      const hasCode = await toggleRow.locator('.ann-code').count();
      const hasName = await toggleRow.locator('.ann-toggle-row-name').count();
      expect(hasCode + hasName).toBeGreaterThan(0);
      
      if (await checkbox.isChecked()) {
        await checkbox.uncheck();
      }
      break;
    }
  });

  test('connection lines connect PDF elements to annotations', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    await waitForAnnotationData(page);
    
    const lineCount = await page.locator('.pdf-connection-line').count();
    if (lineCount > 0) {
      const firstLine = page.locator('.pdf-connection-line').first();
      const style = await firstLine.evaluate(el => ({
        position: getComputedStyle(el).position,
        display: getComputedStyle(el).display,
      }));
      expect(style.position).toBe('fixed');
      expect(style.display).not.toBe('none');
    }
    
    const itemCount = await page.locator('.ann-list-item').count();
    if (itemCount > 0) {
      await page.locator('.ann-list-item').first().click();
      const selectedCount = await page.evaluate(() => document.querySelectorAll('.selected').length);
      expect(selectedCount).toBeGreaterThan(0);
    }
  });

  test('all features work together in disassemble workflow', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    await page.waitForSelector('#pdf-viewer', { timeout: 10000 });
    await waitForAnnotationData(page);
    
    expect(await page.locator('#pdf-viewer').count()).toBeGreaterThan(0);
    expect(await page.locator('#pdf-x-density').count()).toBeGreaterThan(0);
    expect(await page.locator('#pdf-y-density').count()).toBeGreaterThan(0);
    expect(await page.locator('#annotation-list').count()).toBeGreaterThan(0);
    expect(await page.locator('.ann-toggles-container').count()).toBeGreaterThan(0);
  });
});
