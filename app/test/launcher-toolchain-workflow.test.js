const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const root = path.resolve(__dirname, '../..');
for (const name of ['build-launcher.yml', 'release.yml']) {
  describe(`${name} exact Go toolchain contract`, () => {
    const workflow = yaml.parse(fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8'));
    const jobs = Object.values(workflow.jobs);
    const buildJobs = jobs.filter(job => (job.steps || []).some(step => step.name === 'Build launcher from source'));
    test('binds exact complete version output to setup-go pin and Windows target', () => {
      expect(buildJobs).toHaveLength(1);
      const job = buildJobs[0];
      const setup = job.steps.find(step => (step.uses || '').startsWith('actions/setup-go@'));
      const build = job.steps.find(step => step.name === 'Build launcher from source');
      expect(setup.with['go-version']).toBe('1.24.10');
      expect(build.shell).toBe('powershell');
      expect(build.env).toMatchObject({ GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0', GOFLAGS: '-mod=readonly' });
      expect(build.run).toContain('$goVersion = (go version 2>&1 | Out-String).Trim()');
      const gate = build.run.match(/if \(\$LASTEXITCODE -ne 0 -or \$goVersion -cne '([^']+)'\) \{\s+throw [^\n]+\s+\}/);
      expect(gate).not.toBeNull();
      const expected = `go version go${setup.with['go-version']} ${build.env.GOOS}/${build.env.GOARCH}`;
      expect(gate[1]).toBe(expected);
      expect(build.run).not.toMatch(/\$goVersion\s+-notmatch/);
      expect(build.run.indexOf(gate[0])).toBeLessThan(build.run.indexOf('go build'));
    });
    test('exact comparison contract excludes prefix, RC, extra output and alternate target', () => {
      const job = buildJobs[0];
      const source = job.steps.find(step => step.name === 'Build launcher from source').run;
      const literal = source.match(/\$goVersion -cne '([^']+)'/)[1];
      // Cases describe the source's case-sensitive equality contract; no Go/Actions invocation.
      const accept = (exitCode, output) => exitCode === 0 && output.trim() === literal;
      expect(accept(0, 'go version go1.24.10 windows/amd64\r\n')).toBe(true);
      expect(accept(1, literal)).toBe(false);
      for (const output of [
        'go version go1.24.100 windows/amd64', 'go version go1.24.10rc1 windows/amd64',
        'go version go1.24.10 linux/amd64', 'go version go1.24.10 windows/arm64',
        'go version go1.24.10 windows/amd64\nextra', 'go version go1.24.10 WINDOWS/amd64'
      ]) expect(accept(0, output)).toBe(false);
    });
  });
}
