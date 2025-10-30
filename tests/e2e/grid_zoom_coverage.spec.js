// Verifies that the grid overlay covers the entire PDF image at different zoom levels
const { test, expect } = require('@playwright/test');

// Helper function to check if grid covers the page bounds
async function gridCoversPage(page) {
  return await page.evaluate(() => {
    function getOffsetInContainer(el, container) {
      const er = el.getBoundingClientRect();
      const cr = container.getBoundingClientRect();
      return {
        x: (er.left - cr.left) + container.scrollLeft,
        y: (er.top  - cr.top)  + container.scrollTop,
      };
    }

    function snap(v) { return Math.round(v) + 0.5; }

    const container = document.getElementById('pdf-canvas-container');
    if (!container) return false;
    
    const grid = document.getElementById('pdf-grid');
    if (!grid) return false;
    
    const ctx = grid.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    
    // Get all page wrappers
    const wrappers = container.querySelectorAll('.pdf-page-wrapper');
    if (wrappers.length === 0) return false;
    
    // Test each page
    for (const wrapper of wrappers) {
      const pageCanvas = wrapper.querySelector('canvas');
      if (!pageCanvas) continue;
      
      // Get page bounds in container coordinates
      const pageRect = pageCanvas.getBoundingClientRect();
      const offset = getOffsetInContainer(wrapper, container);
      
      // Define test points along the page edges (with small inset)
      const inset = 2;
      const testPoints = [
        // Corners (inset)
        { x: offset.x + inset, y: offset.y + inset },
        { x: offset.x + pageRect.width - inset, y: offset.y + inset },
        { x: offset.x + inset, y: offset.y + pageRect.height - inset },
        { x: offset.x + pageRect.width - inset, y: offset.y + pageRect.height - inset },
        // Midpoints of edges (inset)
        { x: offset.x + pageRect.width / 2, y: offset.y + inset },
        { x: offset.x + pageRect.width / 2, y: offset.y + pageRect.height - inset },
        { x: offset.x + inset, y: offset.y + pageRect.height / 2 },
        { x: offset.x + pageRect.width - inset, y: offset.y + pageRect.height / 2 },
      ];

      // Check for grid lines at test points
      for (const point of testPoints) {
        // Convert to canvas coordinates (accounting for DPR)
        const canvasX = Math.round(point.x * dpr);
        const canvasY = Math.round(point.y * dpr);
        
        // Check a small area around the point
        const size = Math.ceil(2 * dpr); // 2 CSS pixels
        const imageData = ctx.getImageData(
          Math.max(0, canvasX - Math.floor(size/2)),
          Math.max(0, canvasY - Math.floor(size/2)),
          size,
          size
        ).data;
        
        let hasGrid = false;
        // Look for grid pixels (red lines or gray lines)
        for (let i = 0; i < imageData.length; i += 4) {
          const [R, G, B, A] = [
            imageData[i],
            imageData[i + 1],
            imageData[i + 2],
            imageData[i + 3]
          ];
          
          const isRed = R > 170 && G < 80 && B < 80;   // Red grid lines (axes)
          const isGray = R === G && G === B && R < 210; // Gray grid lines
          
          if (A > 0 && (isRed || isGray)) {
            hasGrid = true;
            break;
          }
        }
        
        if (!hasGrid) {
          console.log(`Missing grid at (${point.x}, ${point.y}) on page`);
          return false;
        }
      }
    }
    
    return true;
  });
}

test('grid covers entire PDF at different zoom levels', async ({ page }) => {
  // Set up test directory for screenshots
  await page.evaluate(() => {
    window.testScreenshot = async (name) => {
      const canvas = document.createElement('canvas');
      const container = document.getElementById('pdf-canvas-container');
      const rect = container.getBoundingClientRect();
      
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      
      const ctx = canvas.getContext('2d');
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      
      // Draw the container and its contents
      const data = `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">
            ${container.outerHTML}
          </div>
        </foreignObject>
      </svg>`;
      
      const img = new Image();
      img.src = 'data:image/svg+xml,' + encodeURIComponent(data);
      
      await new Promise(resolve => {
        img.onload = resolve;
        setTimeout(resolve, 100); // Fallback in case onload doesn't fire
      });
      
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      
      // Download the image
      const a = document.createElement('a');
      a.download = `${name}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
  });

  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('#pdf-canvas-container');
  
  // Wait for PDF to be fully loaded and grid to be drawn
  await page.waitForTimeout(1000);
  
  // Test at different zoom levels
  const zoomLevels = [0.5, 0.75, 1, 1.5, 2];
  
  for (const zoom of zoomLevels) {
    // Set zoom level
    await page.evaluate((targetZoom) => {
      const viewport = document.querySelector('.react-pdf__Page__viewport');
      if (viewport) {
        viewport.style.transform = `scale(${targetZoom})`;
      }
    }, zoom);
    
    // Wait for rendering to complete (double rAF to ensure layout is stable)
    await page.evaluate(() => {
      return new Promise(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(resolve, 50); // Additional small delay for good measure
          });
        });
      });
    });
    
    // Verify grid covers the page bounds
    const gridCovers = await gridCoversPage(page);
    expect(gridCovers, `Grid should cover page bounds at ${zoom}x zoom`).toBe(true);
    
    // Take a screenshot for visual verification
    await page.evaluate((zoom) => {
      window.testScreenshot(`grid-zoom-${zoom}x`);
    }, zoom);
  }
  
  // Test with zoom out to minimum
  const minZoom = 0.25;
  await page.evaluate((targetZoom) => {
    const viewport = document.querySelector('.react-pdf__Page__viewport');
    if (viewport) {
      viewport.style.transform = `scale(${targetZoom})`;
    }
  }, minZoom);
  
  // Wait for rendering to complete
  await page.evaluate(() => {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 100); // Longer timeout for minimum zoom
        });
      });
    });
  });
  
  // Verify grid still covers the page bounds at minimum zoom
  const gridCoversAtMinZoom = await gridCoversPage(page);
  expect(gridCoversAtMinZoom, `Grid should cover page bounds at minimum zoom (${minZoom}x)`).toBe(true);
  
  // Take a final screenshot
  await page.evaluate(() => {
    window.testScreenshot(`grid-zoom-${minZoom}x`);
  });
});
