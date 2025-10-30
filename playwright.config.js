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
    // Use the venv uvicorn if present; otherwise rely on system uvicorn
    command: './venv/bin/uvicorn src.johnny5.server:app --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});


