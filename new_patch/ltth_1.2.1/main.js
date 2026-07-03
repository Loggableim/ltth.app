/**
 * LTTH Electron - Root Entry Point
 * 
 * This file serves as a simple wrapper that loads the actual main process
 * from the electron directory. This ensures compatibility with electron-builder
 * which expects the main entry point at the package root.
 */
require('./electron/main');
