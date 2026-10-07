'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const TABLES = [
  'advanced_timers', 'advanced_timer_events', 'advanced_timer_rules', 'advanced_timer_chains',
  'advanced_timer_profiles', 'advanced_timer_gift_overrides', 'advanced_timer_rotator_settings',
  'advanced_timer_threshold_effects', 'advanced_timer_threshold_frames', 'advanced_timer_logs'
];

function openLegacy(api) {
  const dir = api.getConfigPathManager().getPluginDataDir('advanced-timer');
  const dbPath = path.join(dir, 'timers.db');
  if (!fs.existsSync(dbPath)) return { dir, dbPath, db: null };
  try {
    return { dir, dbPath, db: new Database(dbPath, { readonly: true, fileMustExist: true }), error: null };
  } catch (error) {
    return { dir, dbPath, db: null, error: error.message };
  }
}

function inspectLegacy(api, targetDatabase) {
  const legacy = openLegacy(api);
  const counts = {};
  const targetCounts = {};
  try {
    for (const table of TABLES) {
      const sourceExists = legacy.db && legacy.db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table', table);
      const targetExists = targetDatabase.db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table', table);
      counts[table] = sourceExists ? legacy.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count : 0;
      targetCounts[table] = targetExists ? targetDatabase.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count : 0;
    }
    const framesDir = path.join(legacy.dir, 'frames');
    const frameNames = fs.existsSync(framesDir)
      ? fs.readdirSync(framesDir, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name).sort()
      : [];
    const targetFramesDir = path.join(api.getPluginDataDir({ profileScoped: true }), 'frames');
    const frameConflicts = frameNames.filter(name => fs.existsSync(path.join(targetFramesDir, name)));
    const dataCount = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const targetHasUserRows = Object.values(targetCounts).some(count => count > 0);
    return {
      success: true,
      hasLegacyData: (fs.existsSync(legacy.dbPath) || frameNames.length > 0),
      legacyDatabaseError: legacy.error,
      rows: counts,
      targetRows: targetCounts,
      frames: frameNames,
      frameConflicts,
      canImport: !legacy.error && (dataCount > 0 || frameNames.length > 0) && !targetHasUserRows && frameConflicts.length === 0,
      originalsPreserved: true
    };
  } finally {
    legacy.db?.close();
  }
}

function importLegacy(api, targetDatabase, options = {}) {
  const preview = inspectLegacy(api, targetDatabase);
  if (!preview.canImport) throw new Error('Legacy data is unavailable or the target profile already contains timer data or conflicting frame files');
  const legacy = openLegacy(api);
  const targetDir = api.getPluginDataDir({ profileScoped: true });
  const targetFramesDir = path.join(targetDir, 'frames');
  const sourceFramesDir = path.join(legacy.dir, 'frames');
  const stageDir = fs.mkdtempSync(path.join(targetDir, '.legacy-timer-import-'));
  const copiedFrames = [];
  const copyFinalFile = options.copyFinalFile || fs.copyFileSync;
  let importError = null;
  let result = null;
  let committed = false;
  let cleanupWarning = null;

  try {
    const rowsByTable = {};
    const columnsByTable = {};
    for (const table of TABLES) {
      if (!legacy.db || !legacy.db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table', table)) continue;
      const sourceColumns = legacy.db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
      const targetColumns = new Set(targetDatabase.db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
      if (!targetColumns.size) throw new Error(`Target timer schema is missing ${table}`);
      const unavailable = sourceColumns.filter(column => !targetColumns.has(column));
      if (unavailable.length) throw new Error(`Legacy ${table} has unsupported columns: ${unavailable.join(', ')}`);
      columnsByTable[table] = sourceColumns;
      rowsByTable[table] = legacy.db.prepare(`SELECT * FROM ${table}`).all();
    }

    fs.mkdirSync(path.join(stageDir, 'frames'), { recursive: true });
    for (const name of preview.frames) {
      if (name !== path.basename(name) || name.includes('..')) throw new Error(`Unsafe legacy frame name: ${name}`);
      const source = path.join(sourceFramesDir, name);
      if (fs.lstatSync(source).isSymbolicLink()) throw new Error(`Legacy frame is a symbolic link: ${name}`);
      fs.copyFileSync(source, path.join(stageDir, 'frames', name));
    }

    fs.mkdirSync(targetFramesDir, { recursive: true });
    targetDatabase.db.transaction(() => {
      for (const table of TABLES) {
        const columns = columnsByTable[table];
        const rows = rowsByTable[table] || [];
        if (!columns || !rows.length) continue;
        const quotedColumns = columns.map(column => `"${column}"`).join(',');
        const placeholders = columns.map(() => '?').join(',');
        const insert = targetDatabase.db.prepare(`INSERT INTO ${table} (${quotedColumns}) VALUES (${placeholders})`);
        for (const row of rows) insert.run(...columns.map(column => row[column]));
      }
      for (const name of preview.frames) {
        const destination = path.join(targetFramesDir, name);
        copyFinalFile(path.join(stageDir, 'frames', name), destination, fs.constants.COPYFILE_EXCL);
        copiedFrames.push(destination);
      }
    })();
    committed = true;
    result = { success: true, rows: preview.rows, frames: preview.frames.length, restartRequired: true, originalsPreserved: true };
  } catch (error) {
    importError = error;
    const cleanupErrors = [];
    for (const file of copiedFrames.reverse()) {
      try { fs.unlinkSync(file); } catch (cleanupError) { cleanupErrors.push(`${file}: ${cleanupError.message}`); }
    }
    if (cleanupErrors.length) importError.message += `; rollback cleanup failed: ${cleanupErrors.join('; ')}`;
  } finally {
    try { legacy.db?.close(); }
    catch (cleanupError) {
      cleanupWarning = `Legacy source database close failed: ${cleanupError.message}`;
    }
    try { fs.rmSync(stageDir, { recursive: true, force: true }); }
    catch (cleanupError) {
      const warning = `Legacy import staging cleanup failed: ${cleanupError.message}; verify the temporary staging directory manually`;
      cleanupWarning = cleanupWarning ? `${cleanupWarning}; ${warning}` : warning;
    }
  }

  if (importError) {
    if (cleanupWarning) importError.message += `; ${cleanupWarning}`;
    throw importError;
  }
  if (!committed || !result) throw new Error('Legacy timer import did not complete');
  if (cleanupWarning) result.cleanupWarning = cleanupWarning;
  return result;
}

module.exports = { TABLES, inspectLegacy, importLegacy };
