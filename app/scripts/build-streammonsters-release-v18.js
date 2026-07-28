const releaseBuilder = require('./build-streammonsters-release');

module.exports = releaseBuilder;

if (require.main === module) {
  releaseBuilder.main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
