const fs = require('fs');
const path = require('path');

const BOOT_CRITICAL_DEPENDENCIES = [
  'dotenv',
  'express',
  'socket.io',
  'better-sqlite3',
  'winston',
  '@eulerstream/euler-websocket-sdk',
  'jsonwebtoken',
  'axios',
  'ws',
  '@deepgram/sdk'
];

function getDeclaredProductionDependencies(projectRoot) {
  try {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return Object.keys(packageJson.dependencies || {});
  } catch {
    return null;
  }
}

function verifyProductionDependencies(projectRoot) {
  const declaredDependencies = getDeclaredProductionDependencies(projectRoot);
  if (!declaredDependencies) {
    return { valid: false, missing: [], errors: ['package.json'] };
  }

  const missing = [];
  const errors = [];

  for (const dependency of declaredDependencies) {
    const dependencyPath = path.join(projectRoot, 'node_modules', dependency);
    if (!fs.existsSync(dependencyPath)) {
      missing.push(dependency);
    }
  }

  for (const dependency of BOOT_CRITICAL_DEPENDENCIES) {
    if (!declaredDependencies.includes(dependency) || missing.includes(dependency)) {
      continue;
    }

    try {
      const entryPath = require.resolve(dependency, { paths: [projectRoot] });
      delete require.cache[entryPath];
      require(entryPath);
    } catch {
      errors.push(dependency);
    }
  }

  return {
    valid: missing.length === 0 && errors.length === 0,
    missing,
    errors
  };
}

function describeDependencyVerification(verification) {
  const details = [];
  if (verification.missing.length > 0) {
    details.push(`missing packages: ${verification.missing.join(', ')}`);
  }
  if (verification.errors.length > 0) {
    details.push(`unloadable packages: ${verification.errors.join(', ')}`);
  }
  return details.join('; ') || 'dependency integrity check failed';
}

module.exports = {
  BOOT_CRITICAL_DEPENDENCIES,
  describeDependencyVerification,
  verifyProductionDependencies
};
