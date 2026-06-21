/**
 * ESLint configuration for ltth_desktop2/app.
 *
 * Focused rules:
 *   - Enforce structured logging (no raw console.*) in the targeted application
 *     files where logging has been migrated to FrontendLogger.
 *   - Test files and build/vendor artefacts are explicitly excluded to avoid
 *     disrupting the existing test workflow.
 */
module.exports = {
  env: {
    browser: true,
    node: true,
    es2020: true,
    worker: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'script',
  },
  // No global rules that could break unrelated files.
  rules: {},
  overrides: [
    {
      // Files that have been migrated to FrontendLogger — enforce no raw console.
      files: [
        'public/js/sound-worker.js',
        'public/js/dashboard-soundboard.js',
        'public/js/wiki.js',
      ],
      rules: {
        'no-console': 'error',
      },
    },
    {
      // The adapter itself is allowed to use console (it wraps it).
      files: ['public/js/frontend-logger.js'],
      rules: {
        'no-console': 'off',
      },
    },
    {
      // Vendor / minified bundles – do not lint.
      files: [
        'public/js/chart.min.js',
        'public/js/lucide.min.js',
        'public/js/matter.min.js',
        'public/js/vendor/**',
      ],
      rules: {
        'no-console': 'off',
      },
    },
    {
      // Test files – no restrictions on console usage.
      files: [
        'test/**/*.js',
        'test/**/*.cjs',
        '**/*.test.js',
        '**/*.test.cjs',
      ],
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
