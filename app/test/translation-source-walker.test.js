const fs = require('fs');
const os = require('os');
const path = require('path');
const { walkSource } = require('../../scripts/lib/translation-source-walker');

test('skips nested worktree and SDD directories while retaining active source files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-i18n-walk-'));
  try {
    fs.mkdirSync(path.join(root, 'app', 'nested'), { recursive: true });
    fs.mkdirSync(path.join(root, '.worktrees', 'clone'), { recursive: true });
    fs.mkdirSync(path.join(root, '.superpowers', 'sdd'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app', 'visible.html'), '<div data-i18n="app.visible"></div>');
    fs.writeFileSync(path.join(root, 'app', 'nested', 'visible.js'), 'window.i18n.t("app.nested");');
    fs.writeFileSync(path.join(root, '.worktrees', 'clone', 'stale.js'), 'window.i18n.t("stale.worktree");');
    fs.writeFileSync(path.join(root, '.superpowers', 'sdd', 'scratch.js'), 'window.i18n.t("scratch");');

    expect(walkSource(root).map(file => path.relative(root, file).replace(/\\/g, '/')))
      .toEqual(['app/nested/visible.js', 'app/visible.html']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('excludes generated output snapshots while retaining active source files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-i18n-output-walk-'));
  try {
    const files = [
      ['app/public/dashboard.html', '<main data-i18n="dashboard.title"></main>'],
      ['app/plugins/example/main.js', 'window.i18n.t("example.title");'],
      ['output/review/snapshot/app/public/dashboard.html', '<main data-i18n="stale.dashboard"></main>'],
      ['output/review/snapshot/app/plugins/example/main.js', 'window.i18n.t("stale.plugin");']
    ];
    for (const [relative, contents] of files) {
      const file = path.join(root, ...relative.split('/'));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    }

    expect(walkSource(root).map(file => path.relative(root, file).replace(/\\/g, '/')))
      .toEqual(['app/plugins/example/main.js', 'app/public/dashboard.html']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
