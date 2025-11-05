// Playwright configuration for Johnny5 web viewer
// Runs the FastAPI server and executes e2e tests against it
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  timeout: 15000,
  reporter: [
    ['list'],
    ['html'],
    ['json', { outputFile: 'test-results.json' }],
  ],
  use: {
    browserName: 'chromium',
    trace: 'on-first-retry',
    headless: true,
  },
  webServer: {
    // Start ASGI app that exposes FastAPI instance for tests
    command: './venv/bin/uvicorn src.johnny5.server:app --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      JOHNNY5_TEST_PDF: './examples/01-one_page/01-one_page.pdf',
      JOHNNY5_TEST_FIXUP: '',
    },
  },
});


