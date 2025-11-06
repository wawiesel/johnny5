// Flat config for ESLint v9+ (strict, browser globals inline)
/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    files: ["src/johnny5/web/static/app.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        navigator: "readonly",
        requestAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        performance: "readonly",
        WebSocket: "readonly",
        URL: "readonly",
        fetch: "readonly",
        getComputedStyle: "readonly",
        pdfjsLib: "readonly",
        DensityCharts: "readonly",
        ThemeToggle: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["error", { vars: "all", args: "after-used", ignoreRestSiblings: false }],
      "no-undef": "error",
      "no-console": "off"
    }
  }
];


