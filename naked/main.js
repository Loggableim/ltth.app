#!/usr/bin/env node

/**
 * Snapshot root entry point.
 *
 * The Electron main-process files are not present in this workspace snapshot.
 * Starting from the repository root should therefore run the maintained backend
 * server instead of failing on a missing ./electron/main import.
 */
require('./app/server');
