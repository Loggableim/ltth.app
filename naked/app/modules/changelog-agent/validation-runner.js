/**
 * Validation Runner Module
 * 
 * Runs linting, testing, and build validation
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

class ValidationRunner {
  constructor(repositoryPath) {
    this.repoPath = repositoryPath;
    this.appPath = path.join(repositoryPath, 'app');
  }

  /**
   * Run all validations
   */
  async runAll() {
    const results = {
      install: null,
      lint: null,
      test: null,
      build: null,
      failures: []
    };

    try {
      // 1. Install dependencies
      results.install = await this.runInstall();
      if (!results.install.success) {
        results.failures.push('install');
      }

      // 2. Run linter
      results.lint = await this.runLint();
      if (!results.lint.success) {
        results.failures.push('lint');
      }

      // 3. Run tests
      results.test = await this.runTests();
      if (!results.test.success) {
        results.failures.push('test');
      }

      // 4. Run build
      results.build = await this.runBuild();
      if (!results.build.success) {
        results.failures.push('build');
      }
    } catch (error) {
      results.failures.push('validation');
    }

    return results;
  }

  /**
   * Run npm ci to install dependencies
   */
  async runInstall() {
    const outputLimit = 2000; // Configurable output limit
    try {
      const { stdout, stderr } = await execAsync('npm ci', {
        cwd: this.appPath,
        timeout: 180000 // 3 minutes (reduced from 5)
      });

      return {
        success: true,
        command: 'npm ci',
        stdout: this.truncateOutput(stdout, outputLimit),
        stderr: this.truncateOutput(stderr, outputLimit),
        exitCode: 0
      };
    } catch (error) {
      return {
        success: false,
        command: 'npm ci',
        stdout: error.stdout ? this.truncateOutput(error.stdout, outputLimit) : '',
        stderr: error.stderr ? this.truncateOutput(error.stderr, outputLimit) : '',
        exitCode: error.code || 1,
        error: error.message
      };
    }
  }

  /**
   * Truncate output intelligently, preserving error context
   */
  truncateOutput(output, limit = 2000) {
    if (!output || output.length <= limit) {
      return output;
    }
    
    // Try to preserve last part which often contains errors
    const halfLimit = Math.floor(limit / 2);
    const start = output.substring(0, halfLimit);
    const end = output.substring(output.length - halfLimit);
    return `${start}\n... [truncated ${output.length - limit} chars] ...\n${end}`;
  }

  /**
   * Run linter
   */
  async runLint() {
    const outputLimit = 2000;
    try {
      // Check if lint script exists
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(this.appPath, 'package.json'), 'utf8')
      );

      if (!packageJson.scripts || !packageJson.scripts.lint) {
        return {
          success: true,
          command: 'lint',
          stdout: 'No lint script found, skipping',
          stderr: '',
          exitCode: 0,
          skipped: true
        };
      }

      const { stdout, stderr } = await execAsync('npm run lint', {
        cwd: this.appPath,
        timeout: 120000 // 2 minutes
      });

      return {
        success: true,
        command: 'npm run lint',
        stdout: this.truncateOutput(stdout, outputLimit),
        stderr: this.truncateOutput(stderr, outputLimit),
        exitCode: 0
      };
    } catch (error) {
      return {
        success: false,
        command: 'npm run lint',
        stdout: error.stdout ? this.truncateOutput(error.stdout, outputLimit) : '',
        stderr: error.stderr ? this.truncateOutput(error.stderr, outputLimit) : '',
        exitCode: error.code || 1,
        error: error.message
      };
    }
  }

  /**
   * Run tests
   */
  async runTests() {
    const outputLimit = 3000; // Larger for test output
    try {
      const { stdout, stderr } = await execAsync('npm test', {
        cwd: this.appPath,
        timeout: 300000, // 5 minutes
        env: { ...process.env, CI: 'true' }
      });

      return {
        success: true,
        command: 'npm test',
        stdout: this.truncateOutput(stdout, outputLimit),
        stderr: this.truncateOutput(stderr, outputLimit),
        exitCode: 0
      };
    } catch (error) {
      return {
        success: false,
        command: 'npm test',
        stdout: error.stdout ? this.truncateOutput(error.stdout, outputLimit) : '',
        stderr: error.stderr ? this.truncateOutput(error.stderr, outputLimit) : '',
        exitCode: error.code || 1,
        error: error.message
      };
    }
  }

  /**
   * Run build
   */
  async runBuild() {
    const outputLimit = 2000;
    try {
      // Check if build script exists
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(this.appPath, 'package.json'), 'utf8')
      );

      if (!packageJson.scripts || !packageJson.scripts.build) {
        return {
          success: true,
          command: 'build',
          stdout: 'No build script found, skipping',
          stderr: '',
          exitCode: 0,
          skipped: true
        };
      }

      const { stdout, stderr } = await execAsync('npm run build', {
        cwd: this.appPath,
        timeout: 300000 // 5 minutes
      });

      return {
        success: true,
        command: 'npm run build',
        stdout: this.truncateOutput(stdout, outputLimit),
        stderr: this.truncateOutput(stderr, outputLimit),
        exitCode: 0
      };
    } catch (error) {
      return {
        success: false,
        command: 'npm run build',
        stdout: error.stdout ? this.truncateOutput(error.stdout, outputLimit) : '',
        stderr: error.stderr ? this.truncateOutput(error.stderr, outputLimit) : '',
        exitCode: error.code || 1,
        error: error.message
      };
    }
  }
}

module.exports = ValidationRunner;
