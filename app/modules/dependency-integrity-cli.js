#!/usr/bin/env node

const {
  describeDependencyVerification,
  verifyProductionDependencies
} = require('./dependency-integrity');

const verification = verifyProductionDependencies(process.cwd());
if (verification.valid) {
  process.stdout.write('Dependency integrity check passed.\n');
} else {
  process.stderr.write(`Dependency integrity check failed: ${describeDependencyVerification(verification)}\n`);
  process.exitCode = 1;
}
