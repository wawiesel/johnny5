// Verifies disassembly refresh flow:
// - Auto-refresh on page load
// - Indicator state transitions (needs-run → processing → up-to-date)
// - Manual refresh button functionality
// - Option changes trigger cache check and indicator updates
// - SSE completion notification updates indicator
const { test, expect } = require('@playwright/test');
const { waitForDisassemblyComplete } = require('./utils/disassembly');

// Helper to get refresh button indicator state
async function getRefreshIndicatorState(page) {
  return await page.evaluate(() => {
    const btn = document.querySelector('.disassemble-btn');
    if (!btn) return null;
    const states = ['up-to-date', 'needs-run', 'processing', 'error'];
    return states.find(state => btn.classList.contains(state)) || null;
  });
}

// Helper to wait for indicator state
async function waitForIndicatorState(page, expectedState, timeout = 10000) {
  await page.waitForFunction(
    (state) => {
      const btn = document.querySelector('.disassemble-btn');
      if (!btn) return false;
      return btn.classList.contains(state);
    },
    expectedState,
    { timeout }
  );
}

test.describe('Disassembly refresh flow', () => {
  test('auto-refresh triggers on page load and indicator transitions correctly', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    
    // Wait for PDF to load
    await page.waitForSelector('#pdf-canvas-container', { timeout: 10000 });
    await page.waitForSelector('.pdf-page-wrapper', { timeout: 10000 });
    
    // Wait for refresh button to appear
    await page.waitForSelector('.disassemble-btn', { timeout: 10000 });
    
    // Initially should be processing (auto-refresh triggered)
    const initialState = await getRefreshIndicatorState(page);
    expect(['processing', 'up-to-date']).toContain(initialState);
    
    // Wait for disassembly to complete
    await waitForDisassemblyComplete(page);
    
    // Wait a bit for SSE notification to process
    await page.waitForTimeout(1000);
    
    // Indicator should transition to up-to-date after completion
    const finalState = await getRefreshIndicatorState(page);
    expect(finalState).toBe('up-to-date');
  });

  test('manual refresh button updates indicator through states', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    
    // Wait for PDF and initial disassembly
    await page.waitForSelector('.disassemble-btn', { timeout: 10000 });
    await waitForDisassemblyComplete(page);
    await page.waitForTimeout(1000);
    
    // Should be up-to-date after initial load
    let state = await getRefreshIndicatorState(page);
    expect(state).toBe('up-to-date');
    
    // Click refresh button
    const refreshButton = page.locator('.disassemble-btn');
    await refreshButton.click();
    
    // Should transition to processing
    await waitForIndicatorState(page, 'processing', 5000);
    
    // Wait for completion
    await waitForDisassemblyComplete(page);
    await page.waitForTimeout(1000);
    
    // Should return to up-to-date
    state = await getRefreshIndicatorState(page);
    expect(state).toBe('up-to-date');
  });

  test('changing options updates indicator to needs-run', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    
    // Wait for PDF and initial disassembly
    await page.waitForSelector('.disassemble-btn', { timeout: 10000 });
    await waitForDisassemblyComplete(page);
    await page.waitForTimeout(1000);
    
    // Should be up-to-date
    let state = await getRefreshIndicatorState(page);
    expect(state).toBe('up-to-date');
    
    // Change layout model
    const layoutSelect = page.locator('#docling-layout-select');
    if (await layoutSelect.count() > 0) {
      const currentValue = await layoutSelect.inputValue();
      const allOptions = await layoutSelect.locator('option').allTextContents();
      const otherOption = allOptions.find(opt => opt !== currentValue);
      
      if (otherOption) {
        await layoutSelect.selectOption({ label: otherOption });
        await page.waitForTimeout(500); // Allow cache check to complete
        
        // Should transition to needs-run (or up-to-date if cache exists)
        state = await getRefreshIndicatorState(page);
        expect(['needs-run', 'up-to-date']).toContain(state);
      }
    }
  });

  test('SSE completion notification updates indicator and reloads annotations', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    
    // Wait for PDF to load
    await page.waitForSelector('.disassemble-btn', { timeout: 10000 });
    
    // Trigger manual refresh
    const refreshButton = page.locator('.disassemble-btn');
    await refreshButton.click();
    
    // Wait for processing state
    await waitForIndicatorState(page, 'processing', 5000);
    
    // Wait for completion via SSE
    await waitForDisassemblyComplete(page);
    
    // Wait for SSE notification to be processed (indicator update + annotation reload)
    await page.waitForTimeout(2000);
    
    // Verify indicator is up-to-date
    const state = await getRefreshIndicatorState(page);
    expect(state).toBe('up-to-date');
    
    // Verify annotations are loaded (if structure data exists)
    const annotationCount = await page.locator('.ann-list-item').count();
    // If there are annotations, they should be visible
    if (annotationCount > 0) {
      const firstItem = page.locator('.ann-list-item').first();
      await expect(firstItem).toBeVisible();
    }
  });

  test('error state is shown when refresh fails', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    
    // Wait for PDF to load
    await page.waitForSelector('.disassemble-btn', { timeout: 10000 });
    await waitForDisassemblyComplete(page);
    await page.waitForTimeout(1000);
    
    // Intercept and fail the refresh request
    await page.route('/api/disassemble-refresh', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ success: false, error: 'Test error' })
      });
    });
    
    // Click refresh button
    const refreshButton = page.locator('.disassemble-btn');
    await refreshButton.click();
    
    // Should show error state
    await waitForIndicatorState(page, 'error', 5000);
    
    // Verify error state
    const state = await getRefreshIndicatorState(page);
    expect(state).toBe('error');
  });
});

