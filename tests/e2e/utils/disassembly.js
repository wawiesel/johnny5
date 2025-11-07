/**
 * Shared helpers for disassembly-related Playwright tests.
 */

async function waitForDisassemblyComplete(page) {
  // Wait for disassembly to complete by polling the status API
  await page.waitForFunction(async () => {
    try {
      const response = await fetch('/api/disassembly-status');
      const status = await response.json();
      return status.status === 'completed';
    } catch {
      return false;
    }
  }, { timeout: 60000 }); // Allow up to 60s for disassembly
}

async function waitForAnnotationData(page) {
  // First wait for disassembly to complete
  await waitForDisassemblyComplete(page);
  // Then wait for annotations to appear (allow time for client to process SSE notification)
  await page.waitForFunction(() => {
    const items = document.querySelectorAll('.ann-list-item');
    return items.length > 0;
  }, { timeout: 30000 }); // 30s buffer for annotation rendering after disassembly
}

module.exports = {
  waitForDisassemblyComplete,
  waitForAnnotationData,
};

