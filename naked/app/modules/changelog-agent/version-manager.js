/**
 * Version Manager Module
 * 
 * Manages version bumping logic (semver/calver) and updates version files
 */

const fs = require('fs');
const path = require('path');

class VersionManager {
  constructor(releasePolicy = 'semver') {
    this.releasePolicy = releasePolicy;
  }

  /**
   * Determine version bumps for packages
   */
  async determineVersionBumps(classifiedCommits, packages) {
    const updates = [];

    for (const pkg of packages) {
      const currentVersion = await this.getCurrentVersion(pkg);
      const bumpType = this.determineBumpType(classifiedCommits);
      const newVersion = this.calculateNewVersion(currentVersion, bumpType);

      updates.push({
        package: pkg,
        currentVersion,
        newVersion,
        bumpType,
        files: await this.getVersionFiles(pkg)
      });
    }

    return updates;
  }

  /**
   * Get current version from package
   */
  async getCurrentVersion(pkg) {
    try {
      if (fs.existsSync(pkg.packageJson)) {
        const packageData = JSON.parse(fs.readFileSync(pkg.packageJson, 'utf8'));
        return packageData.version || '0.0.0';
      }
      return '0.0.0';
    } catch (error) {
      return '0.0.0';
    }
  }

  /**
   * Determine bump type based on commits
   */
  determineBumpType(classifiedCommits) {
    // Check for breaking changes
    const hasBreaking = classifiedCommits.some(c => c.classification.breaking);
    if (hasBreaking) {
      return 'major';
    }

    // Check for features
    const hasFeatures = classifiedCommits.some(c => c.classification.type === 'feat');
    if (hasFeatures) {
      return 'minor';
    }

    // Default to patch
    return 'patch';
  }

  /**
   * Calculate new version based on bump type
   */
  calculateNewVersion(currentVersion, bumpType) {
    if (this.releasePolicy === 'calver') {
      return this.calculateCalver();
    }

    // Semver
    const parts = currentVersion.split('.').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return '1.0.0';
    }

    const [major, minor, patch] = parts;

    switch (bumpType) {
      case 'major':
        return `${major + 1}.0.0`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'patch':
        return `${major}.${minor}.${patch + 1}`;
      default:
        return currentVersion;
    }
  }

  /**
   * Calculate calver version
   */
  calculateCalver() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  }

  /**
   * Get all files that need version updates
   */
  async getVersionFiles(pkg) {
    const files = [];

    // package.json
    if (fs.existsSync(pkg.packageJson)) {
      files.push({
        path: pkg.packageJson,
        type: 'package.json'
      });
    }

    // Root package.json (Electron app) - resolve from app/package.json to root
    const appDir = path.dirname(pkg.packageJson);
    const rootPackageJson = path.resolve(appDir, '..', 'package.json');
    if (fs.existsSync(rootPackageJson) && rootPackageJson !== pkg.packageJson) {
      files.push({
        path: rootPackageJson,
        type: 'package.json'
      });
    }

    // plugin.json files in plugins directory
    const pluginsDir = path.join(path.dirname(pkg.packageJson), 'plugins');
    if (fs.existsSync(pluginsDir)) {
      const plugins = fs.readdirSync(pluginsDir);
      for (const plugin of plugins) {
        const pluginJsonPath = path.join(pluginsDir, plugin, 'plugin.json');
        if (fs.existsSync(pluginJsonPath)) {
          files.push({
            path: pluginJsonPath,
            type: 'plugin.json',
            pluginId: plugin
          });
        }
      }
    }

    // VERSION file (if exists)
    const versionFile = path.join(path.dirname(pkg.packageJson), 'VERSION');
    if (fs.existsSync(versionFile)) {
      files.push({
        path: versionFile,
        type: 'VERSION'
      });
    }

    return files;
  }

  /**
   * Update version in all relevant files
   */
  async updateFiles(versionUpdates) {
    const updated = [];

    for (const update of versionUpdates) {
      for (const file of update.files) {
        try {
          await this.updateFile(file, update.newVersion);
          updated.push(file.path);
        } catch (error) {
          throw new Error(`Failed to update ${file.path}: ${error.message}`);
        }
      }
    }

    return updated;
  }

  /**
   * Update version in a specific file
   */
  async updateFile(file, newVersion) {
    switch (file.type) {
      case 'package.json':
      case 'plugin.json':
        await this.updateJsonFile(file.path, newVersion);
        break;
      case 'VERSION':
        fs.writeFileSync(file.path, newVersion, 'utf8');
        break;
      default:
        throw new Error(`Unknown file type: ${file.type}`);
    }
  }

  /**
   * Update version in JSON file
   */
  async updateJsonFile(filePath, newVersion) {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    content.version = newVersion;
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
  }
}

module.exports = VersionManager;
