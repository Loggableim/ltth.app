#!/usr/bin/env node

/**
 * i18n Key Validator
 * Scans codebase for translation key usage and validates against locale files
 */

const fs = require('fs');
const path = require('path');

// Paths
const localesDir = path.join(__dirname, '../locales');
const publicDir = path.join(__dirname, '../public');

// Load translation files
function loadTranslations(locale) {
    const filePath = path.join(localesDir, `${locale}.json`);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Flatten nested JSON to dot notation
function flattenKeys(obj, prefix = '') {
    let keys = [];
    for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            keys = keys.concat(flattenKeys(value, newKey));
        } else {
            keys.push(newKey);
        }
    }
    return keys;
}

// Find all i18n key usage in code
function findUsedKeys(dir, extensions = ['.js', '.html']) {
    const usedKeys = new Set();
    
    function scanFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Pattern 1: i18n.t('key.name')
        const pattern1 = /i18n\.t\(['"]([\w.]+)['"]/g;
        let match;
        while ((match = pattern1.exec(content)) !== null) {
            usedKeys.add(match[1]);
        }
        
        // Pattern 2: data-i18n="key.name"
        const pattern2 = /data-i18n(?:-\w+)?=["']([\w.]+)["']/g;
        while ((match = pattern2.exec(content)) !== null) {
            usedKeys.add(match[1]);
        }
    }
    
    function walkDir(currentPath) {
        const files = fs.readdirSync(currentPath);
        
        for (const file of files) {
            const filePath = path.join(currentPath, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                // Skip node_modules and hidden directories
                if (!file.startsWith('.') && file !== 'node_modules') {
                    walkDir(filePath);
                }
            } else {
                const ext = path.extname(file);
                if (extensions.includes(ext)) {
                    scanFile(filePath);
                }
            }
        }
    }
    
    walkDir(dir);
    return Array.from(usedKeys).sort();
}

// Main validation
function validateTranslations() {
    console.log('🔍 i18n Key Validation\n');
    console.log('='.repeat(60));
    
    // Load translations
    const en = loadTranslations('en');
    const de = loadTranslations('de');
    
    if (!en) {
        console.error('❌ Error: locales/en.json not found!');
        process.exit(1);
    }
    
    // Get all defined keys
    const enKeys = flattenKeys(en);
    const deKeys = de ? flattenKeys(de) : [];
    
    console.log(`\n📊 Translation Statistics:`);
    console.log(`   English keys: ${enKeys.length}`);
    console.log(`   German keys:  ${deKeys.length}`);
    
    // Find used keys in code
    console.log(`\n🔎 Scanning codebase...`);
    const usedKeys = findUsedKeys(publicDir);
    console.log(`   Found ${usedKeys.length} key references in code`);
    
    // Find missing keys (used in code but not in translations)
    const missingInEn = usedKeys.filter(key => !enKeys.includes(key));
    const missingInDe = usedKeys.filter(key => !deKeys.includes(key));
    
    // Find unused keys (defined but never used)
    const unusedInEn = enKeys.filter(key => !usedKeys.includes(key));
    
    // Report
    console.log('\n' + '='.repeat(60));
    console.log('📋 Validation Report\n');
    
    if (missingInEn.length > 0) {
        console.log(`❌ Missing in en.json (${missingInEn.length}):`);
        missingInEn.forEach(key => console.log(`   - ${key}`));
        console.log('');
    }
    
    if (missingInDe.length > 0) {
        console.log(`⚠️  Missing in de.json (${missingInDe.length}):`);
        missingInDe.forEach(key => console.log(`   - ${key}`));
        console.log('');
    }
    
    if (unusedInEn.length > 0) {
        console.log(`📦 Potentially unused keys (${unusedInEn.length}):`);
        console.log(`   (These are defined but not found in public/ code)`);
        unusedInEn.slice(0, 10).forEach(key => console.log(`   - ${key}`));
        if (unusedInEn.length > 10) {
            console.log(`   ... and ${unusedInEn.length - 10} more`);
        }
        console.log('');
    }
    
    // Summary
    console.log('='.repeat(60));
    if (missingInEn.length === 0 && missingInDe.length === 0) {
        console.log('✅ All used keys are properly translated!');
    } else {
        console.log(`⚠️  Found ${missingInEn.length + missingInDe.length} missing translations`);
    }
    
    // Save reports
    const reports = {
        missing: {
            en: missingInEn,
            de: missingInDe
        },
        unused: unusedInEn,
        stats: {
            totalEnKeys: enKeys.length,
            totalDeKeys: deKeys.length,
            usedKeys: usedKeys.length,
            missingEnKeys: missingInEn.length,
            missingDeKeys: missingInDe.length,
            unusedKeys: unusedInEn.length
        }
    };
    
    const reportPath = path.join(localesDir, 'validation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));
    console.log(`\n💾 Full report saved to: ${path.relative(process.cwd(), reportPath)}`);
}

// Run validation
validateTranslations();
