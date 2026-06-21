module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  coverageDirectory: 'coverage',
  testTimeout: 10000,
  collectCoverageFrom: [
    'modules/**/*.js',
    'routes/**/*.js',
    '!**/node_modules/**'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(nanoid|uuid|franc-min|trigram-utils|n-gram|collapse-white-space|@exodus/bytes|@asamuzakjp/css-color|@asamuzakjp/generational-cache|@asamuzakjp/dom-selector|@csstools|jsdom|parse5|entities|marked)/)'
  ],
  transform: {
    '^.+\\.m?js$': 'babel-jest',
  },
};
