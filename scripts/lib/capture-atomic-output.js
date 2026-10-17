'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function writeCaptureAtomically(target, renderAndValidate, options = {}) {
  const fileSystem = options.fs || fs;
  const pid = options.pid ?? process.pid;
  const token = (options.randomBytes || crypto.randomBytes)(8).toString('hex');
  const temporaryPath = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${pid}.${token}.tmp.png`
  );
  let committed = false;

  try {
    const value = await renderAndValidate(temporaryPath);
    fileSystem.renameSync(temporaryPath, target);
    committed = true;
    return value;
  } finally {
    if (!committed && fileSystem.existsSync(temporaryPath)) {
      fileSystem.rmSync(temporaryPath, { force: true });
    }
  }
}

module.exports = { writeCaptureAtomically };
