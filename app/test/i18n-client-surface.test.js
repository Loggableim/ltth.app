const fs = require('fs');
const path = require('path');

function walk(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'docs_archive', '.superpowers', 'naked', 'new_patch', 'released_patches'].includes(entry.name) || entry.name.startsWith('.tmp')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, result);
    else if (/\.html$/i.test(entry.name)) result.push(full);
  }
  return result;
}

describe('app HTML i18n surface contract', () => {
  test('every marked app/plugin HTML page loads the shared client', () => {
    const appRoot = path.join(__dirname, '..');
    const pages = walk(appRoot).filter(file => !file.includes(`${path.sep}wiki${path.sep}`));
    const missing = pages.filter(file => {
      const source = fs.readFileSync(file, 'utf8');
      return /data-i18n(?:[\s-]|=)/i.test(source) && !/\/js\/i18n-client\.js/i.test(source);
    });
    expect(missing).toEqual([]);
  });
});
