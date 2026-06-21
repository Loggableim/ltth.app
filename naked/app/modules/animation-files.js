const path = require('path');

const SAFE_ANIMATION_FILENAME = /^animation-[a-zA-Z0-9._-]+\.(webm|gif|mp4|png|jpe?g)$/i;

function getSafeAnimationFilename(filename) {
  const value = String(filename || '');

  if (path.basename(value) !== value || !SAFE_ANIMATION_FILENAME.test(value)) {
    throw new Error('Invalid animation filename');
  }

  return value;
}

function getAnimationFilePath(uploadDir, filename) {
  const safeFilename = getSafeAnimationFilename(filename);
  const root = path.resolve(uploadDir);
  const filePath = path.resolve(root, safeFilename);
  const relative = path.relative(root, filePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Animation path resolves outside upload directory');
  }

  return filePath;
}

module.exports = {
  getSafeAnimationFilename,
  getAnimationFilePath
};
