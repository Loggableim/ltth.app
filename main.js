#!/usr/bin/env node

/**
 * Snapshot root entry point.
 *
 * The Electron main-process files are not present in this workspace snapshot.
 * Starting from the repository root should go through the maintained launcher
 * so Node/native module checks happen against the active runtime before the
 * backend server starts.
 */
require('./app/launch');
