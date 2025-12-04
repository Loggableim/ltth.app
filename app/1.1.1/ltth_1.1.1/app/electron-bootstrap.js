/**
 * Electron Bootstrap Module
 * 
 * This module is preloaded (-r flag) when running the backend server in Electron mode.
 * It sets up the module resolution paths and provides comprehensive error handling
 * for native module compatibility issues.
 * 
 * Usage: node -r ./electron-bootstrap.js server.js
 */

'use strict';

const path = require('path');
const fs = require('fs');
const Module = require('module');

// Get the directory where this bootstrap file is located
const appDir = __dirname;
const nodeModulesPath = path.join(appDir, 'node_modules');

// ============================================================================
// STEP 1: Setup uncaught exception handler FIRST to catch all errors
// ============================================================================
process.on('uncaughtException', (error) => {
  console.error('[ELECTRON BOOTSTRAP] FATAL: Uncaught exception:', error.message);
  console.error('[ELECTRON BOOTSTRAP] Stack:', error.stack);
  
  // Check for common native module errors
  if (error.message.includes('was compiled against a different Node.js version')) {
    console.error('[ELECTRON BOOTSTRAP] ⚠️ NATIVE MODULE MISMATCH DETECTED!');
    console.error('[ELECTRON BOOTSTRAP] The native module was compiled for a different Node.js version.');
    console.error('[ELECTRON BOOTSTRAP] Solution: Run "@electron/rebuild" to recompile native modules.');
    console.error('[ELECTRON BOOTSTRAP] Command: npx @electron/rebuild -f -w better-sqlite3');
  }
  
  if (error.message.includes('Cannot find module')) {
    console.error('[ELECTRON BOOTSTRAP] ⚠️ MODULE NOT FOUND!');
    console.error('[ELECTRON BOOTSTRAP] Module path:', nodeModulesPath);
    console.error('[ELECTRON BOOTSTRAP] Exists:', fs.existsSync(nodeModulesPath));
  }
  
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[ELECTRON BOOTSTRAP] Unhandled Promise Rejection:', reason);
});

// ============================================================================
// STEP 2: Patch Module._nodeModulePaths for robust module resolution
// ============================================================================
const originalNodeModulePaths = Module._nodeModulePaths;
Module._nodeModulePaths = function(from) {
  const paths = originalNodeModulePaths.call(this, from);
  
  // Add our node_modules at the beginning if not already present
  if (!paths.includes(nodeModulesPath)) {
    paths.unshift(nodeModulesPath);
  }
  
  return paths;
};

// Also add to the current module's paths
if (!module.paths.includes(nodeModulesPath)) {
  module.paths.unshift(nodeModulesPath);
}

// Update NODE_PATH for any child processes
const currentNodePath = process.env.NODE_PATH || '';
if (!currentNodePath.includes(nodeModulesPath)) {
  process.env.NODE_PATH = currentNodePath 
    ? `${nodeModulesPath}${path.delimiter}${currentNodePath}`
    : nodeModulesPath;
}

// ============================================================================
// STEP 3: Pre-validate critical paths and native modules
// ============================================================================
const validateEnvironment = () => {
  const issues = [];
  
  // Check node_modules exists
  if (!fs.existsSync(nodeModulesPath)) {
    issues.push(`node_modules not found at: ${nodeModulesPath}`);
  }
  
  // Check critical dependencies - these are the minimum required to start
  // Note: This is a subset of dependencies that must exist for the app to boot
  const criticalDeps = ['dotenv', 'express', 'better-sqlite3', 'socket.io'];
  for (const dep of criticalDeps) {
    const depPath = path.join(nodeModulesPath, dep);
    if (!fs.existsSync(depPath)) {
      issues.push(`Missing critical dependency: ${dep}`);
    }
  }
  
  // Check better-sqlite3 native binding
  const sqliteBindingPath = path.join(nodeModulesPath, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  const sqlitePrebuiltPath = path.join(nodeModulesPath, 'better-sqlite3', 'prebuilds');
  
  if (!fs.existsSync(sqliteBindingPath) && !fs.existsSync(sqlitePrebuiltPath)) {
    issues.push(`better-sqlite3 native binding not found. This module needs to be compiled for Electron.`);
  }
  
  return issues;
};

const envIssues = validateEnvironment();
if (envIssues.length > 0) {
  console.error('[ELECTRON BOOTSTRAP] Environment validation failed:');
  envIssues.forEach(issue => console.error(`  - ${issue}`));
  // Don't exit - let the actual error happen so we get better diagnostics
}

// ============================================================================
// STEP 4: Validate better-sqlite3 can be resolved (without loading it)
// ============================================================================
try {
  // Only validate the module can be resolved - don't actually load it yet
  // This avoids slowing down startup while still catching path issues
  const sqlitePath = require.resolve('better-sqlite3');
  console.log('[ELECTRON BOOTSTRAP] better-sqlite3 resolved at:', sqlitePath);
} catch (error) {
  console.error('[ELECTRON BOOTSTRAP] ⚠️ CRITICAL: Cannot resolve better-sqlite3!');
  console.error('[ELECTRON BOOTSTRAP] Error:', error.message);
  
  if (error.code === 'MODULE_NOT_FOUND') {
    console.error('[ELECTRON BOOTSTRAP] =====================================================');
    console.error('[ELECTRON BOOTSTRAP] MODULE NOT FOUND!');
    console.error('[ELECTRON BOOTSTRAP] The better-sqlite3 module could not be found.');
    console.error('[ELECTRON BOOTSTRAP] Expected at:', nodeModulesPath);
    console.error('[ELECTRON BOOTSTRAP]');
    console.error('[ELECTRON BOOTSTRAP] To fix this:');
    console.error('[ELECTRON BOOTSTRAP] 1. Ensure node_modules are included in the build');
    console.error('[ELECTRON BOOTSTRAP] 2. Check electron-builder.yml configuration');
    console.error('[ELECTRON BOOTSTRAP] =====================================================');
  }
  
  // Re-throw to let the process exit with proper error
  throw error;
}

// Debug logging (only if explicitly enabled)
if (process.env.DEBUG_MODULE_PATHS === 'true') {
  console.log('[ELECTRON BOOTSTRAP] App directory:', appDir);
  console.log('[ELECTRON BOOTSTRAP] Node modules path:', nodeModulesPath);
  console.log('[ELECTRON BOOTSTRAP] NODE_PATH:', process.env.NODE_PATH);
  console.log('[ELECTRON BOOTSTRAP] Module paths (first 5):', module.paths.slice(0, 5));
}

console.log('[ELECTRON BOOTSTRAP] Bootstrap completed successfully');
