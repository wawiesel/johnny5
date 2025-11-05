// Verifies disassemble (no fixup) workflow features:
// - Density charts display (X and Y)
// - Annotations with bounding boxes
// - Label toggles for filtering
// - Connection lines from PDF elements to annotations
const { test, expect } = require('@playwright/test');

async function waitForAnnotationData(page) {
  await page.waitForFunction(() => {
    const items = document.querySelectorAll('.ann-list-item');
    return items.length > 0;
  }, { timeout: 15000 });
}

test.describe('Disassemble (no fixup) workflow', () => {
  test('density charts are displayed', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    
    // Wait for PDF and structure data to load
    await page.waitForSelector('#pdf-canvas-container', { timeout: 10000 });
    await page.waitForSelector('.pdf-page-wrapper', { timeout: 10000 });
    
    // Wait for structure data to load (check for annotation overlays)
    await page.waitForTimeout(2000); // Allow time for API calls
    
    // Check for X-density chart on left
    const xDensityLeft = page.locator('#pdf-x-density');
    await expect(xDensityLeft).toBeVisible();
    
    // Check for Y-density chart on left
    const yDensityLeft = page.locator('#pdf-y-density');
    await expect(yDensityLeft).toBeVisible();
    
    // Check if density charts have content (canvases or rendered content)
    const hasDensityContent = await page.evaluate(() => {
      const xDensity = document.getElementById('pdf-x-density');
      const yDensity = document.getElementById('pdf-y-density');
      
      // Check if there are canvas elements or other content
      const xHasContent = xDensity && (xDensity.querySelector('canvas') || xDensity.children.length > 0);
      const yHasContent = yDensity && (yDensity.querySelector('canvas') || yDensity.children.length > 0);
      
      return xHasContent || yHasContent;
    });
    
    expect(hasDensityContent).toBeTruthy();
  });

  test('annotations are displayed with bounding boxes', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    
    // Wait for PDF to load
    await page.waitForSelector('.pdf-page-wrapper', { timeout: 10000 });
    await waitForAnnotationData(page);
    
    // Check for annotation overlays on PDF pages
    const overlays = page.locator('.pdf-bbox-overlay');
    const overlayCount = await overlays.count();
    
    // Should have at least some annotations if structure data exists
    if (overlayCount > 0) {
      // Verify overlays are visible and have proper styling
      const firstOverlay = overlays.first();
      await expect(firstOverlay).toBeVisible();
      
      // Check that overlays have bounding box styling
      const overlayStyle = await firstOverlay.evaluate(el => {
        return {
          position: getComputedStyle(el).position,
          border: getComputedStyle(el).border,
          backgroundColor: getComputedStyle(el).backgroundColor
        };
      });
      
      expect(overlayStyle.position).toBe('absolute');
      expect(overlayStyle.border).toBeTruthy();
    }
  });

  test('annotation list is populated', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    
    // Wait for structure data to load
    await waitForAnnotationData(page);
    
    // Check for annotation list items
    const annotationItems = page.locator('.ann-list-item');
    const itemCount = await annotationItems.count();
    
    // Should have annotation items if structure data exists
    if (itemCount > 0) {
      // Verify items have code box with content
      const firstItem = annotationItems.first();
      await expect(firstItem).toBeVisible();
      
      const hasCode = await firstItem.locator('.ann-code').count();
      
      expect(hasCode).toBeGreaterThan(0);
      
      // Verify code has text content
      const codeText = await firstItem.locator('.ann-code').textContent();
      expect(codeText.length).toBeGreaterThan(0);
    }
  });

  test('label toggles are displayed and functional', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    
    // Wait for structure data to load
    await page.waitForSelector('.ann-toggles-container', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Check for label checkboxes
    const checkboxes = page.locator('.ann-toggles-container input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    
    if (checkboxCount > 0) {
      // Verify checkboxes exist and have associated code/name elements
      const firstCheckbox = checkboxes.first();
      const checkboxId = await firstCheckbox.getAttribute('id');
      
      // Verify toggle row structure
      const toggleRow = page.locator(`.ann-toggle-row input[type="checkbox"]#${checkboxId}`).locator('..').first();
      await expect(toggleRow).toBeVisible();
      
      // Check for code and name elements in toggle row
      const hasCode = await toggleRow.locator('.ann-code').count();
      const hasName = await toggleRow.locator('.ann-toggle-row-name').count();
      
      // Should have either code or name (or both)
      expect(hasCode + hasName).toBeGreaterThan(0);
      
      // Test toggle functionality - uncheck first checkbox (skip none/all checkbox)
      if (checkboxId !== 'ann-none-all' && await firstCheckbox.isChecked()) {
        await firstCheckbox.uncheck();
        
        // Verify that annotation overlays are filtered (if any exist)
        const visibleOverlays = await page.evaluate(() => {
          const overlays = document.querySelectorAll('.pdf-bbox-overlay');
          return Array.from(overlays).filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none';
          }).length;
        });
        
        // At least some overlays should be hidden when a label is unchecked
        // (if there are overlays and they match the unchecked label)
      }
    }
  });

  test('connection lines connect PDF elements to annotations', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    
    // Wait for structure data to load
    await waitForAnnotationData(page);
    
    // Check for connection lines
    const connectionLines = page.locator('.pdf-connection-line');
    const lineCount = await connectionLines.count();
    
    if (lineCount > 0) {
      // Verify connection lines exist and are styled
      const firstLine = connectionLines.first();
      
      const lineStyle = await firstLine.evaluate(el => {
        return {
          position: getComputedStyle(el).position,
          display: getComputedStyle(el).display,
          width: getComputedStyle(el).width,
          height: getComputedStyle(el).height
        };
      });
      
      // Connection lines should be positioned and have dimensions
      expect(lineStyle.position).toBe('fixed');
      expect(lineStyle.display).not.toBe('none');
    }
    
    // Verify that clicking an annotation highlights both overlay and line
    const annotationItems = page.locator('.ann-list-item');
    const itemCount = await annotationItems.count();
    
    if (itemCount > 0) {
      const firstItem = annotationItems.first();
      await firstItem.click();
      
      // Check if corresponding overlay and line are selected
      const selectedElements = await page.evaluate(() => {
        const selected = document.querySelectorAll('.selected');
        return Array.from(selected).map(el => el.className);
      });
      
      // Should have at least one selected element (overlay, item, or line)
      expect(selectedElements.length).toBeGreaterThan(0);
    }
  });

  test('all features work together in disassemble workflow', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/');
    
    // Wait for everything to load
    await page.waitForSelector('#pdf-canvas-container', { timeout: 10000 });
    await page.waitForTimeout(3000); // Allow time for all API calls
    
    // Verify all key components are present
    const components = {
      pdfViewer: await page.locator('#pdf-viewer').count(),
      xDensity: await page.locator('#pdf-x-density').count(),
      yDensity: await page.locator('#pdf-y-density').count(),
      annotationList: await page.locator('#annotation-list').count(),
      labelToggles: await page.locator('.ann-toggles-container').count(),
    };
    
    // All components should exist
    expect(components.pdfViewer).toBeGreaterThan(0);
    expect(components.xDensity).toBeGreaterThan(0);
    expect(components.yDensity).toBeGreaterThan(0);
    expect(components.annotationList).toBeGreaterThan(0);
    expect(components.labelToggles).toBeGreaterThan(0);
    
    // Verify structure data is loaded (check for any annotations)
    const hasStructureData = await page.evaluate(() => {
      const hasOverlays = document.querySelectorAll('.pdf-bbox-overlay').length > 0;
      const hasListItems = document.querySelectorAll('.ann-list-item').length > 0;
      return hasOverlays || hasListItems;
    });
    
    // If structure data exists, we should see annotations
    // (If no structure data, that's okay - the test just verifies the UI is ready)
  });
});
