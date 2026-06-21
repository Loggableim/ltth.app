const commonGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  fetch: 'readonly',
  WebSocket: 'readonly',
  Worker: 'readonly',
  console: 'readonly',
  process: 'readonly',
  require: 'readonly',
  module: 'readonly',
  exports: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'public/js/chart.min.js',
      'public/js/lucide.min.js',
      'public/js/matter.min.js',
      'public/js/vendor/**',
      'plugins/openshock/ui.js',
      'plugins/talking-heads/assets/ui-old.js',
      'test/animazingpal-enhanced-features.test.js',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: commonGlobals,
    },
    rules: {},
  },
  {
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
    files: ['public/js/frontend-logger.js', 'test/**/*.js', '**/*.test.js', '**/*.manual.js'],
    rules: {
      'no-console': 'off',
    },
  },
];
