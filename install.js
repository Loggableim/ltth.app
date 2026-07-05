#!/usr/bin/env node
require('child_process').execSync('curl -fsSL https://raw.githubusercontent.com/Loggableim/ltth.app/main/install/install.js | node', { stdio: 'inherit' });
