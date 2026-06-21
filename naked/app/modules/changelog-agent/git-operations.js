/**
 * Git Operations Module
 * 
 * Handles all git operations for the changelog agent
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

class GitOperations {
  constructor(repositoryPath) {
    this.repoPath = repositoryPath;
  }

  /**
   * Execute git command in repository
   * Note: Command string should be pre-validated to prevent injection
   */
  async git(command, options = {}) {
    try {
      // Basic sanitization: ensure command doesn't contain dangerous characters
      if (command.includes(';') || command.includes('&&') || command.includes('||')) {
        throw new Error('Invalid git command: contains command chaining characters');
      }
      
      const { stdout, stderr } = await execAsync(`git ${command}`, {
        cwd: this.repoPath,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        ...options
      });
      return stdout.trim();
    } catch (error) {
      throw new Error(`Git command failed: ${command}\n${error.message}`);
    }
  }

  /**
   * Fetch all tags and branches
   */
  async fetchAll() {
    return await this.git('fetch --all --tags --prune');
  }

  /**
   * Get short SHA for a ref
   */
  async getShortSha(ref) {
    return await this.git(`rev-parse --short ${ref}`);
  }

  /**
   * Get latest annotated tag
   */
  async getLatestTag() {
    try {
      const tags = await this.git('tag --list --sort=-creatordate v*');
      const tagList = tags.split('\n').filter(Boolean);
      return tagList.length > 0 ? tagList[0] : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get main branch (origin/main or origin/master)
   */
  async getMainBranch() {
    try {
      // Check if origin/main exists
      await this.git('rev-parse --verify origin/main');
      return 'origin/main';
    } catch (error) {
      try {
        // Fallback to origin/master
        await this.git('rev-parse --verify origin/master');
        return 'origin/master';
      } catch (error2) {
        return null;
      }
    }
  }

  /**
   * Get merge-base between two refs
   */
  async getMergeBase(ref1, ref2) {
    return await this.git(`merge-base ${ref1} ${ref2}`);
  }

  /**
   * Get commits between two refs
   */
  async getCommits(baseRef, targetRef) {
    const format = '%H|%an|%ae|%ad|%s|%b';
    const output = await this.git(
      `log --pretty=format:'${format}' ${baseRef}..${targetRef} --reverse`
    );

    const commits = [];
    const lines = output.split('\n').filter(Boolean);

    for (const line of lines) {
      const parts = line.replace(/^'|'$/g, '').split('|');
      if (parts.length >= 5) {
        commits.push({
          hash: parts[0],
          author: parts[1],
          email: parts[2],
          date: parts[3],
          subject: parts[4],
          body: parts[5] || ''
        });
      }
    }

    return commits;
  }

  /**
   * Get changed files between two refs
   */
  async getChangedFiles(baseRef, targetRef) {
    const output = await this.git(`diff --name-only ${baseRef}..${targetRef}`);
    return output.split('\n').filter(Boolean);
  }

  /**
   * Get diff for specific file
   */
  async getFileDiff(baseRef, targetRef, filePath) {
    try {
      return await this.git(`diff --unified=3 ${baseRef}..${targetRef} -- "${filePath}"`);
    } catch (error) {
      return '';
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName, baseRef) {
    return await this.git(`checkout -b ${branchName} ${baseRef}`);
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch() {
    return await this.git('rev-parse --abbrev-ref HEAD');
  }

  /**
   * Stage all changes
   */
  async stageAll() {
    return await this.git('add -A');
  }

  /**
   * Commit changes
   */
  async commit(message) {
    return await this.git(`commit -m "${message.replace(/"/g, '\\"')}"`);
  }

  /**
   * Push branch to remote
   */
  async push(branchName, remote = 'origin') {
    return await this.git(`push ${remote} ${branchName}`);
  }

  /**
   * Get git status
   */
  async getStatus() {
    return await this.git('status --porcelain');
  }

  /**
   * Create format-patch
   */
  async createFormatPatch(baseRef, targetRef, outputDir) {
    return await this.git(`format-patch ${baseRef}..${targetRef} -o "${outputDir}"`);
  }
}

module.exports = GitOperations;
