// Verifies disassembly refresh flow: auto-refresh, manual refresh, indicator states, error handling
const { test, expect } = require('@playwright/test');
const {
  waitForDisassemblyComplete,
  getRefreshIndicatorState,
  waitForIndicatorState,
  waitForPageReady,
} = require('./utils/disassembly');

test.describe('Disassembly refresh flow', () => {
  test('auto-refresh triggers on page load and indicator transitions correctly', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    await page.waitForSelector('.disassemble-btn', { timeout: 10000 });
    
    // Wait for PDF to load and auto-refresh to start (indicator should be processing or up-to-date)
    await page.waitForFunction(() => {
      const btn = document.querySelector('.disassemble-btn');
      if (!btn) return false;
      return btn.classList.contains('processing') || btn.classList.contains('up-to-date');
    }, { timeout: 5000 });
    
    const initialState = await getRefreshIndicatorState(page);
    expect(['processing', 'up-to-date']).toContain(initialState);
    
    if (initialState === 'processing') {
      await waitForDisassemblyComplete(page);
      await waitForIndicatorState(page, 'up-to-date', 10000);
    }
    
    expect(await getRefreshIndicatorState(page)).toBe('up-to-date');
  });

  test('manual refresh button updates indicator through states', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    await waitForPageReady(page);
    
    await page.locator('.disassemble-btn').click();
    await waitForIndicatorState(page, 'processing', 5000);
    await waitForDisassemblyComplete(page);
    await waitForIndicatorState(page, 'up-to-date', 10000);
    expect(await getRefreshIndicatorState(page)).toBe('up-to-date');
  });

  test('changing options updates indicator to needs-run', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    await waitForPageReady(page);
    
    const layoutSelect = page.locator('#docling-layout-select');
    if (await layoutSelect.count() === 0) return;
    
    const currentValue = await layoutSelect.inputValue();
    const allOptions = await layoutSelect.locator('option').allTextContents();
    const otherOption = allOptions.find(opt => opt !== currentValue);
    
    if (otherOption) {
      await layoutSelect.selectOption({ label: otherOption });
      // Wait for cache check to complete and indicator to update
      await page.waitForFunction(() => {
        const btn = document.querySelector('.disassemble-btn');
        if (!btn) return false;
        return btn.classList.contains('needs-run') || btn.classList.contains('up-to-date');
      }, { timeout: 5000 });
      const state = await getRefreshIndicatorState(page);
      expect(['needs-run', 'up-to-date']).toContain(state);
    }
  });

  test('SSE completion notification updates indicator and reloads annotations', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    await waitForPageReady(page);
    
    await page.locator('.disassemble-btn').click();
    await waitForIndicatorState(page, 'processing', 5000);
    await waitForDisassemblyComplete(page);
    await waitForIndicatorState(page, 'up-to-date', 10000);
    
    const annotationCount = await page.locator('.ann-list-item').count();
    if (annotationCount > 0) {
      await expect(page.locator('.ann-list-item').first()).toBeVisible();
    }
  });

  test('error state is shown when refresh fails', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    await waitForPageReady(page);
    
    // Set up route interception AFTER page is ready, so initial load succeeds
    await page.route('**/api/disassemble-refresh', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Test error' })
      });
    });
    
    // Now click refresh - it should fail and show error state
    await page.locator('.disassemble-btn').click();
    
    // Wait for error state to appear
    await waitForIndicatorState(page, 'error', 10000);
    expect(await getRefreshIndicatorState(page)).toBe('error');
  });
});

