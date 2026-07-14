'use strict';

const path = require('path');
const { verifyPluginDocsE2e } = require('./lib/plugin-docs-e2e');

const result = verifyPluginDocsE2e(path.resolve(__dirname, '..'));
if (result.errors.length) {
  console.error(`Plugin docs e2e verification found ${result.errors.length} issue(s):`);
  result.errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`OK: ${result.variants} localized guide variants have content, links, and screenshots.`);
}
