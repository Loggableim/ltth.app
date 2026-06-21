/**
 * Test suite for Config Import Plugin - Database Handling
 * Tests database validation, WAL checkpoint, and safe copy functionality
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

console.log('🧪 Running Config Import Database Handling Tests...\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
        failed++;
    }
}

// Load the plugin
const ConfigImportPlugin = require('../plugins/config-import/main.js');

// Mock API for testing
const mockApi = {
    logs: [],
    log: function(msg, level) {
        this.logs.push({ msg, level });
    },
    registerRoute: function() {}
};

// Create plugin instance
const plugin = new ConfigImportPlugin(mockApi);

// Test 1: Should validate a healthy database
runTest('Should validate a healthy SQLite database', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    
    // Create a valid database
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)`);
    db.exec(`INSERT INTO test (value) VALUES ('test1'), ('test2')`);
    db.close();
    
    // Validate it
    const result = plugin.validateDatabaseFile(dbPath);
    
    assert(result.success === true, 'Validation should succeed for healthy database');
    
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Test 2: Should reject non-existent database
runTest('Should reject non-existent database file', () => {
    const result = plugin.validateDatabaseFile('/non/existent/database.db');
    
    assert(result.success === false, 'Validation should fail for non-existent file');
    assert(result.error.includes('does not exist'), 'Error should mention file does not exist');
});

// Test 3: Should reject non-database file
runTest('Should reject non-database files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
    const filePath = path.join(tmpDir, 'notadb.db');
    
    // Create a non-database file
    fs.writeFileSync(filePath, 'This is not a database file');
    
    const result = plugin.validateDatabaseFile(filePath);
    
    assert(result.success === false, 'Validation should fail for non-database file');
    
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Test 4: Should safely copy a simple database
runTest('Should safely copy a database file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
    const srcPath = path.join(tmpDir, 'source.db');
    const destPath = path.join(tmpDir, 'dest.db');
    
    // Create a source database
    const db = new Database(srcPath);
    db.exec(`CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)`);
    db.exec(`INSERT INTO test (value) VALUES ('test1'), ('test2')`);
    db.close();
    
    // Copy it
    const result = plugin.safeCopyDatabase(srcPath, destPath);
    
    assert(result.success === true, 'Copy should succeed');
    assert(result.filesCopied >= 1, 'At least main DB file should be copied');
    assert(fs.existsSync(destPath), 'Destination file should exist');
    
    // Verify the copy is valid
    const destDb = new Database(destPath, { readonly: true });
    const rows = destDb.prepare('SELECT COUNT(*) as count FROM test').get();
    destDb.close();
    
    assert(rows.count === 2, 'Copied database should have correct data');
    
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Test 5: Should handle database with WAL mode
runTest('Should handle database in WAL mode', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
    const srcPath = path.join(tmpDir, 'source-wal.db');
    const destPath = path.join(tmpDir, 'dest-wal.db');
    
    // Create a database in WAL mode
    const db = new Database(srcPath);
    db.pragma('journal_mode = WAL');
    db.exec(`CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)`);
    db.exec(`INSERT INTO test (value) VALUES ('wal1'), ('wal2'), ('wal3')`);
    
    // Insert more data to ensure WAL file exists
    const insert = db.prepare('INSERT INTO test (value) VALUES (?)');
    for (let i = 0; i < 100; i++) {
        insert.run(`value${i}`);
    }
    
    db.close();
    
    // Verify WAL file exists
    const walExists = fs.existsSync(`${srcPath}-wal`);
    console.log(`  WAL file exists before copy: ${walExists}`);
    
    // Copy it
    const result = plugin.safeCopyDatabase(srcPath, destPath);
    
    assert(result.success === true, 'Copy should succeed for WAL mode database');
    assert(fs.existsSync(destPath), 'Destination file should exist');
    
    // Verify the copy is valid and has all data
    const destDb = new Database(destPath, { readonly: true });
    const rows = destDb.prepare('SELECT COUNT(*) as count FROM test').get();
    destDb.close();
    
    assert(rows.count === 103, 'Copied database should have all data (3 + 100)');
    
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Test 6: Should provide helpful error for corrupted database
runTest('Should detect corrupted database', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
    const dbPath = path.join(tmpDir, 'corrupted.db');
    
    // Create a database then corrupt it
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE test (id INTEGER PRIMARY KEY)`);
    db.close();
    
    // Corrupt the file by truncating it
    const fd = fs.openSync(dbPath, 'r+');
    fs.ftruncateSync(fd, 100); // Truncate to invalid size
    fs.closeSync(fd);
    
    const result = plugin.validateDatabaseFile(dbPath);
    
    assert(result.success === false, 'Validation should fail for corrupted database');
    
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Test 7: Should validate after copy
runTest('Should validate database after copying', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
    const srcPath = path.join(tmpDir, 'source.db');
    const destPath = path.join(tmpDir, 'dest.db');
    
    // Create source
    const db = new Database(srcPath);
    db.exec(`CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)`);
    db.exec(`INSERT INTO test (value) VALUES ('validate-test')`);
    db.close();
    
    // Copy
    const result = plugin.safeCopyDatabase(srcPath, destPath);
    
    assert(result.success === true, 'Copy should succeed');
    assert(result.errors.length === 0, 'Should have no validation errors');
    
    // The destination should be validated automatically
    assert(fs.existsSync(destPath), 'Destination should exist after successful copy');
    
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Print summary
console.log('\n📊 Test Summary:');
console.log(`   Total: ${passed + failed}`);
console.log(`   Passed: ${passed}`);
console.log(`   Failed: ${failed}`);

if (failed === 0) {
    console.log('\n✅ All database handling tests passed!');
    process.exit(0);
} else {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
}
