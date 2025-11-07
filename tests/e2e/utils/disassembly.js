/**
 * Shared helpers for disassembly-related Playwright tests.
 */

async function waitForDisassemblyComplete(page) {
  await page.waitForFunction(async () => {
    try {
      const response = await fetch('/api/disassembly-status');
      const status = await response.json();
      return status.status === 'completed';
    } catch {
      return false;
    }
  }, { timeout: 30000 });
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

async function waitForIndicatorState(page, expectedState, timeout = 10000) {
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

