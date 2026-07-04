#!/usr/bin/env node
require('child_process').execSync('curl -fsSL https://ltth.app/install/install.js | node', { stdio: 'inherit' });