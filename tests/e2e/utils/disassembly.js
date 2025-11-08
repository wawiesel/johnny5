/**
 * Shared helpers for disassembly-related Playwright tests.
 */

async function waitForDisassemblyComplete(page, timeout = 30000) {
  await page.waitForFunction(
    async (expectedStatus) => {
      const viewer = window.viewer;
      if (!viewer || !viewer.pdfChecksum || !viewer.currentCacheKey) {
        return false;
      }
      const params = new URLSearchParams({
        pdf_checksum: viewer.pdfChecksum,
        cache_key: viewer.currentCacheKey,
      });
      try {
        const response = await fetch(`/api/disassembly-status?${params.toString()}`);
        if (!response.ok) {
          return false;
        }
        const status = await response.json();
        return status.status === expectedStatus;
      } catch {
        return false;
      }
    },
    'completed',
    { timeout }
  );
}

async function waitForAnnotationData(page) {
  await waitForDisassemblyComplete(page);
  await page.waitForFunction(() => {
    const items = document.querySelectorAll('.ann-list-item');
    return items.length > 0;
  }, { timeout: 10000 });
}

async function getRefreshIndicatorState(page) {
  return await page.evaluate(() => {
    const btn = document.querySelector('.disassemble-btn');
    if (!btn) return null;
    const states = ['up-to-date', 'needs-run', 'processing', 'error'];
    return states.find(state => btn.classList.contains(state)) || null;
  });
}

async function waitForIndicatorState(page, expectedState, timeout = 15000) {
  await page.waitForFunction(
    (state) => {
      const btn = document.querySelector('.disassemble-btn');
      return btn && btn.classList.contains(state);
    },
    expectedState,
    { timeout }
  );
}

async function waitForPageReady(page) {
  await page.waitForSelector('.disassemble-btn', { timeout: 10000 });
  await waitForDisassemblyComplete(page);
  await waitForIndicatorState(page, 'up-to-date', 10000);
}

module.exports = {
  waitForDisassemblyComplete,
  waitForAnnotationData,
  getRefreshIndicatorState,
  waitForIndicatorState,
  waitForPageReady,
};

