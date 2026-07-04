const { Blob, File } = require('buffer');

if (typeof global.Blob === 'undefined') {
  global.Blob = Blob;
}

if (typeof global.File === 'undefined') {
  global.File = File;
}
