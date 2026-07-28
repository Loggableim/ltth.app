'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STORAGE_DIRECTORY = '.stable-overlay-routing';
const PROFILE_DIRECTORY = 'profiles';
const CREDENTIAL_FILE = 'credentials.json';
const PENDING_ENROLLMENT_FILE = 'pending-enrollment.json';
const MAX_CREDENTIAL_FILE_BYTES = 16 * 1024;
const CREDENTIAL_ERROR_CODE = 'STABLE_OVERLAY_CREDENTIAL_INVALID';
const ALLOWED_FIELDS = Object.freeze([
  'deviceId',
  'credential',
  'enrolledAt',
  'label',
  'defaultUsername'
]);

function credentialError(message) {
  const error = new Error(message);
  error.code = CREDENTIAL_ERROR_CODE;
  return error;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative));
}

function normalizeProfileId(value) {
  if (typeof value !== 'string') {
    throw credentialError('A valid LTTH profile is required');
  }
  const normalized = value.trim().normalize('NFKC');
  if (!normalized || normalized.length > 256) {
    throw credentialError('A valid LTTH profile is required');
  }
  return normalized;
}

function normalizeDefaultUsername(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw credentialError('The selected default username is invalid');
  }
  const normalized = value.trim().normalize('NFKC').toLowerCase();
  if (
    normalized.length < 2 ||
    normalized.length > 24 ||
    !/^[a-z0-9_.]+$/.test(normalized) ||
    normalized.split('.').some(segment => segment.length === 0)
  ) {
    throw credentialError('The selected default username is invalid');
  }
  return normalized;
}

function normalizeRecord(value, { rejectUnknown = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw credentialError('The credential file is invalid');
  }
  if (
    rejectUnknown &&
    Object.keys(value).some(key => !ALLOWED_FIELDS.includes(key))
  ) {
    throw credentialError('The credential file contains unsupported fields');
  }

  if (
    typeof value.deviceId !== 'string' ||
    value.deviceId.length < 1 ||
    value.deviceId.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(value.deviceId)
  ) {
    throw credentialError('The device credential is invalid');
  }
  if (
    typeof value.credential !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.credential)
  ) {
    throw credentialError('The device credential is invalid');
  }
  if (
    typeof value.enrolledAt !== 'string' ||
    !Number.isFinite(Date.parse(value.enrolledAt))
  ) {
    throw credentialError('The enrollment time is invalid');
  }
  if (typeof value.label !== 'string') {
    throw credentialError('The device label is invalid');
  }
  const label = value.label.trim().normalize('NFKC');
  if (
    label.length < 1 ||
    Array.from(label).length > 64 ||
    /[\u0000-\u001f\u007f]/.test(label)
  ) {
    throw credentialError('The device label is invalid');
  }

  return {
    deviceId: value.deviceId,
    credential: value.credential,
    enrolledAt: new Date(value.enrolledAt).toISOString(),
    label,
    defaultUsername: normalizeDefaultUsername(value.defaultUsername)
  };
}

function applyMode(filePath, mode) {
  try {
    fs.chmodSync(filePath, mode);
  } catch (error) {
    if (
      process.platform !== 'win32' ||
      !['EINVAL', 'ENOSYS', 'EPERM'].includes(error.code)
    ) {
      throw error;
    }
  }
}

function ensureSafeDirectory(parent, name, boundaries) {
  const candidate = path.resolve(parent, name);
  if (!isInside(parent, candidate)) {
    throw credentialError('Credential storage escaped profile application data');
  }
  if (fs.existsSync(candidate)) {
    const entry = fs.lstatSync(candidate);
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw credentialError('Credential storage contains an unsafe directory');
    }
  } else {
    fs.mkdirSync(candidate, { mode: 0o700 });
  }

  const resolved = fs.realpathSync(candidate);
  if (!isInside(boundaries.userDataDir, resolved)) {
    throw credentialError('Credential storage escaped profile application data');
  }
  if (isInside(boundaries.sourceRoot, resolved)) {
    throw credentialError('Credential storage must stay outside application source');
  }
  if (isInside(boundaries.pluginsDir, resolved)) {
    throw credentialError('Credential storage must stay outside plugin paths');
  }
  applyMode(resolved, 0o700);
  return resolved;
}

class StableOverlayRoutingCredentials {
  constructor({
    configPathManager,
    profileId,
    sourceRoot = path.resolve(__dirname, '..')
  } = {}) {
    if (
      !configPathManager ||
      typeof configPathManager.getDefaultConfigDir !== 'function' ||
      typeof configPathManager.getPluginsDir !== 'function'
    ) {
      throw new TypeError('A config path manager is required');
    }

    const defaultConfigDir = path.resolve(
      configPathManager.getDefaultConfigDir()
    );
    const pluginsDir = path.resolve(configPathManager.getPluginsDir());
    const applicationSource = path.resolve(sourceRoot);
    const profileKey = crypto
      .createHash('sha256')
      .update(normalizeProfileId(profileId), 'utf8')
      .digest('hex');

    if (isInside(applicationSource, defaultConfigDir)) {
      throw credentialError('Credential storage must stay outside application source');
    }
    if (isInside(pluginsDir, defaultConfigDir)) {
      throw credentialError('Credential storage must stay outside plugin paths');
    }

    if (fs.existsSync(defaultConfigDir)) {
      const defaultEntry = fs.lstatSync(defaultConfigDir);
      if (defaultEntry.isSymbolicLink() || !defaultEntry.isDirectory()) {
        throw credentialError('Credential storage contains an unsafe default root');
      }
    } else {
      fs.mkdirSync(defaultConfigDir, { recursive: true, mode: 0o700 });
    }
    const resolvedDefaultConfigDir = fs.realpathSync(defaultConfigDir);
    const resolvedPluginsDir = fs.existsSync(pluginsDir)
      ? fs.realpathSync(pluginsDir)
      : pluginsDir;
    const resolvedSource = fs.existsSync(applicationSource)
      ? fs.realpathSync(applicationSource)
      : applicationSource;

    if (isInside(resolvedSource, resolvedDefaultConfigDir)) {
      throw credentialError('Credential storage must stay outside application source');
    }
    if (isInside(resolvedPluginsDir, resolvedDefaultConfigDir)) {
      throw credentialError('Credential storage must stay outside plugin paths');
    }
    applyMode(resolvedDefaultConfigDir, 0o700);

    const userDataDir = path.resolve(
      resolvedDefaultConfigDir,
      'user_data'
    );
    if (fs.existsSync(userDataDir)) {
      const userDataEntry = fs.lstatSync(userDataDir);
      if (userDataEntry.isSymbolicLink() || !userDataEntry.isDirectory()) {
        throw credentialError('Credential storage contains unsafe application data');
      }
    } else {
      fs.mkdirSync(userDataDir, { mode: 0o700 });
    }
    const resolvedUserDataDir = fs.realpathSync(userDataDir);
    if (!isInside(resolvedDefaultConfigDir, resolvedUserDataDir)) {
      throw credentialError('Credential storage escaped profile application data');
    }
    if (isInside(resolvedSource, resolvedUserDataDir)) {
      throw credentialError('Credential storage must stay outside application source');
    }
    if (isInside(resolvedPluginsDir, resolvedUserDataDir)) {
      throw credentialError('Credential storage must stay outside plugin paths');
    }
    applyMode(resolvedUserDataDir, 0o700);

    const boundaries = {
      userDataDir: resolvedUserDataDir,
      sourceRoot: resolvedSource,
      pluginsDir: resolvedPluginsDir
    };
    const credentialRoot = ensureSafeDirectory(
      resolvedUserDataDir,
      STORAGE_DIRECTORY,
      boundaries
    );
    const profilesRoot = ensureSafeDirectory(
      credentialRoot,
      PROFILE_DIRECTORY,
      boundaries
    );
    this.profileDataDir = ensureSafeDirectory(
      profilesRoot,
      profileKey,
      boundaries
    );
    this.filePath = path.resolve(this.profileDataDir, CREDENTIAL_FILE);
    this.pendingFilePath = path.resolve(
      this.profileDataDir,
      PENDING_ENROLLMENT_FILE
    );
    if (
      !isInside(this.profileDataDir, this.filePath) ||
      !isInside(this.profileDataDir, this.pendingFilePath)
    ) {
      throw credentialError('Credential storage escaped profile application data');
    }
  }

  getProfileDataDir() {
    return this.profileDataDir;
  }

  getFilePath() {
    return this.filePath;
  }

  getPendingFilePath() {
    return this.pendingFilePath;
  }

  _verifyRuntimePath() {
    let profileEntry;
    try {
      profileEntry = fs.lstatSync(this.profileDataDir);
    } catch (_) {
      throw credentialError('The credential storage path is invalid');
    }
    if (profileEntry.isSymbolicLink() || !profileEntry.isDirectory()) {
      throw credentialError('The credential storage path is invalid');
    }
    const resolvedProfileDir = fs.realpathSync(this.profileDataDir);
    if (path.relative(this.profileDataDir, resolvedProfileDir) !== '') {
      throw credentialError('The credential storage path is invalid');
    }
    for (const filePath of [this.filePath, this.pendingFilePath]) {
      if (!fs.existsSync(filePath)) {
        continue;
      }
      const fileEntry = fs.lstatSync(filePath);
      if (fileEntry.isSymbolicLink() || !fileEntry.isFile()) {
        throw credentialError('The credential file path is invalid');
      }
      const resolvedFile = fs.realpathSync(filePath);
      if (!isInside(resolvedProfileDir, resolvedFile)) {
        throw credentialError('The credential file path is invalid');
      }
    }
  }

  _loadFile(filePath) {
    this._verifyRuntimePath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size > MAX_CREDENTIAL_FILE_BYTES) {
      throw credentialError('The credential file is invalid');
    }
    let value;
    try {
      value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
      throw credentialError('The credential file is invalid');
    }
    return normalizeRecord(value, { rejectUnknown: true });
  }

  load() {
    return this._loadFile(this.filePath);
  }

  loadPendingEnrollment() {
    return this._loadFile(this.pendingFilePath);
  }

  _writeFile(filePath, tempLabel, value) {
    this._verifyRuntimePath();
    const record = normalizeRecord(value);
    const tempPath = path.join(
      this.profileDataDir,
      `.${tempLabel}-${crypto.randomBytes(12).toString('hex')}.tmp`
    );
    let descriptor = null;
    try {
      descriptor = fs.openSync(tempPath, 'wx', 0o600);
      fs.writeFileSync(
        descriptor,
        `${JSON.stringify(record, null, 2)}\n`,
        'utf8'
      );
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = null;
      applyMode(tempPath, 0o600);
      fs.renameSync(tempPath, filePath);
      applyMode(filePath, 0o600);
      return { ...record };
    } catch (error) {
      if (descriptor !== null) {
        try {
          fs.closeSync(descriptor);
        } catch (_) {}
      }
      try {
        fs.unlinkSync(tempPath);
      } catch (_) {}
      throw error;
    }
  }

  save(value) {
    return this._writeFile(this.filePath, 'credentials', value);
  }

  stageEnrollment(value) {
    const record = normalizeRecord({
      ...value,
      defaultUsername: null
    });
    if (!/^d-[0-9a-f]{32}$/.test(record.deviceId)) {
      throw credentialError('The pending enrollment identity is invalid');
    }
    this._writeFile(
      this.pendingFilePath,
      'pending-enrollment',
      record
    );
  }

  commitPendingEnrollment(device) {
    const pending = this.loadPendingEnrollment();
    if (!pending) {
      throw credentialError('No pending device enrollment is stored');
    }
    if (!device || typeof device !== 'object' || Array.isArray(device)) {
      throw credentialError('The pending enrollment response is invalid');
    }
    let active;
    try {
      active = normalizeRecord({
        deviceId: device.deviceId,
        credential: pending.credential,
        enrolledAt: device.createdAt,
        label: device.label,
        defaultUsername: null
      });
    } catch (_) {
      throw credentialError('The pending enrollment response is invalid');
    }
    if (
      active.deviceId !== pending.deviceId ||
      active.label !== pending.label
    ) {
      throw credentialError('The pending enrollment response is invalid');
    }
    this._writeFile(this.filePath, 'credentials', active);
    this._removeFile(this.pendingFilePath);
  }

  setDefaultUsername(username) {
    const current = this.load();
    if (!current) {
      throw credentialError('No device enrollment is stored');
    }
    return this.save({
      ...current,
      defaultUsername: normalizeDefaultUsername(username)
    });
  }

  remove() {
    return this._removeFile(this.filePath);
  }

  removePendingEnrollment() {
    return this._removeFile(this.pendingFilePath);
  }

  _removeFile(filePath) {
    this._verifyRuntimePath();
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }
}

module.exports = {
  StableOverlayRoutingCredentials,
  CREDENTIAL_ERROR_CODE
};
