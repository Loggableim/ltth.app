'use strict';
const fs = require('fs');
const path = require('path');
function patchRealpath(api) {
  const original = api.realpathSync.native;
  api.realpathSync.native = target => {
    try { return original(target); }
    catch (error) {
      if (error.code !== 'EPERM') throw error;
      return path.resolve(String(target));
    }
  };
}
patchRealpath(fs);
patchRealpath(require('graceful-fs'));
