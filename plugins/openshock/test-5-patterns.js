/**
 * @file test-5-patterns.js - Test 5 patterns with OpenShock devices
 * @description Comprehensive test of pattern system using real API
 */

const https = require('https');

// Configuration
const API_KEY = '6PP4UFqvQg1sWEyWKTD30dvbBMLfwtaW5sPwfopq8HKBSNIQYxdabBV0fANe623m';
const BASE_URL = 'api.openshock.app';

// Load Pattern Engine
const PatternEngine = require('./src/features/pattern-editor/engine/PatternEngine.ts.js');

// Colors for logging
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

// OpenShock API Client
class OpenShockClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    async getDevices() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: BASE_URL,
                path: '/1/devices',
                method: 'GET',
                headers: {
                    'accept': 'application/json',
                    'OpenShockToken': this.apiKey
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.data || []);
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    async sendControl(shockerId, type, intensity, duration) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify({
                shocks: [{
                    id: shockerId,
                    type: type,
                    intensity: Math.round(intensity),
                    duration: Math.round(duration),
                    exclusive: false
                }],
                customName: 'Pattern Test'
            });

            const options = {
                hostname: BASE_URL,
                path: '/2/shockers/control',
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    'OpenShockToken': this.apiKey
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(data ? JSON.parse(data) : {});
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(payload);
            req.end();
        });
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Test Pattern 1: Konstant (Constant)
async function testPattern1_Konstant(client, shocker) {
    log('═══════════════════════════════════════════════════', 'cyan');
    log('PATTERN 1: Konstant (Constant Intensity)', 'cyan');
    log('═══════════════════════════════════════════════════', 'cyan');
    
    const pattern = {
        id: 'test-konstant',
        name: 'Konstant Test',
        type: 'preset',
        sourcePreset: 'Konstant',
        params: { intensity: 40 },
        duration: 2000
    };

    log('Pattern: Konstant mit 40% Intensität für 2 Sekunden', 'yellow');
    
    // Create engine and extract keyframes
    const engine = new PatternEngine(pattern, () => {});
    const keyframes = engine.keyframes;
    
    log(`Generierte ${keyframes.length} Keyframes`, 'blue');
    keyframes.forEach((kf, i) => {
        log(`  KF${i + 1}: ${kf.time}ms @ ${kf.intensity}% (${kf.interpolation})`, 'blue');
    });

    // Execute pattern as vibration
    log('Sende an Gerät...', 'magenta');
    await client.sendControl(shocker.id, 2, 40, 2000); // Vibrate
    await sleep(2500);
    
    log('✓ Pattern 1 abgeschlossen', 'green');
    return true;
}

// Test Pattern 2: Rampe (Ramp)
async function testPattern2_Rampe(client, shocker) {
    log('═══════════════════════════════════════════════════', 'cyan');
    log('PATTERN 2: Rampe (Linear Ramp)', 'cyan');
    log('═══════════════════════════════════════════════════', 'cyan');
    
    const pattern = {
        id: 'test-rampe',
        name: 'Rampe Test',
        type: 'preset',
        sourcePreset: 'Rampe',
        params: { startIntensity: 20, endIntensity: 60, duration: 3000 },
        duration: 3000
    };

    log('Pattern: Rampe von 20% auf 60% über 3 Sekunden', 'yellow');
    
    const engine = new PatternEngine(pattern, () => {});
    const keyframes = engine.keyframes;
    
    log(`Generierte ${keyframes.length} Keyframes`, 'blue');
    keyframes.forEach((kf, i) => {
        log(`  KF${i + 1}: ${kf.time}ms @ ${kf.intensity}% (${kf.interpolation})`, 'blue');
    });

    // Execute as stepped vibrations
    log('Sende schrittweise Intensität...', 'magenta');
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const intensity = 20 + (60 - 20) * progress;
        log(`  Schritt ${i + 1}/${steps + 1}: ${Math.round(intensity)}%`, 'magenta');
        await client.sendControl(shocker.id, 2, intensity, 400);
        await sleep(500);
    }
    
    log('✓ Pattern 2 abgeschlossen', 'green');
    return true;
}

// Test Pattern 3: Puls (Pulse)
async function testPattern3_Puls(client, shocker) {
    log('═══════════════════════════════════════════════════', 'cyan');
    log('PATTERN 3: Puls (Pulse Wave)', 'cyan');
    log('═══════════════════════════════════════════════════', 'cyan');
    
    const pattern = {
        id: 'test-puls',
        name: 'Puls Test',
        type: 'preset',
        sourcePreset: 'Puls',
        params: { intensity: 50, pulseDuration: 400, pauseDuration: 400 },
        duration: 4000
    };

    log('Pattern: Pulse bei 50% (400ms on, 400ms off)', 'yellow');
    
    const engine = new PatternEngine(pattern, () => {});
    const keyframes = engine.keyframes;
    
    log(`Generierte ${keyframes.length} Keyframes`, 'blue');
    log(`Erste 6 Keyframes:`, 'blue');
    keyframes.slice(0, 6).forEach((kf, i) => {
        log(`  KF${i + 1}: ${kf.time}ms @ ${kf.intensity}% (${kf.interpolation})`, 'blue');
    });

    // Execute pulse pattern
    log('Sende Puls-Sequenz...', 'magenta');
    for (let i = 0; i < 5; i++) {
        log(`  Puls ${i + 1}/5`, 'magenta');
        await client.sendControl(shocker.id, 2, 50, 400);
        await sleep(800);
    }
    
    log('✓ Pattern 3 abgeschlossen', 'green');
    return true;
}

// Test Pattern 4: Welle (Wave)
async function testPattern4_Welle(client, shocker) {
    log('═══════════════════════════════════════════════════', 'cyan');
    log('PATTERN 4: Welle (Sine Wave)', 'cyan');
    log('═══════════════════════════════════════════════════', 'cyan');
    
    const pattern = {
        id: 'test-welle',
        name: 'Welle Test',
        type: 'preset',
        sourcePreset: 'Welle',
        params: { minIntensity: 20, maxIntensity: 70, frequency: 1 },
        duration: 4000
    };

    log('Pattern: Sinuswelle von 20% bis 70% bei 1Hz', 'yellow');
    
    const engine = new PatternEngine(pattern, () => {});
    const keyframes = engine.keyframes;
    
    log(`Generierte ${keyframes.length} Keyframes`, 'blue');
    log(`Erste 8 Keyframes:`, 'blue');
    keyframes.slice(0, 8).forEach((kf, i) => {
        log(`  KF${i + 1}: ${kf.time}ms @ ${kf.intensity}% (${kf.interpolation})`, 'blue');
    });

    // Execute wave pattern
    log('Sende Wellen-Sequenz...', 'magenta');
    const samples = 8;
    for (let i = 0; i <= samples; i++) {
        const progress = i / samples;
        const phase = progress * 2 * Math.PI;
        const intensity = 20 + (70 - 20) * (Math.sin(phase) + 1) / 2;
        log(`  Sample ${i + 1}/${samples + 1}: ${Math.round(intensity)}%`, 'magenta');
        await client.sendControl(shocker.id, 2, intensity, 400);
        await sleep(500);
    }
    
    log('✓ Pattern 4 abgeschlossen', 'green');
    return true;
}

// Test Pattern 5: Zufall (Random)
async function testPattern5_Zufall(client, shocker) {
    log('═══════════════════════════════════════════════════', 'cyan');
    log('PATTERN 5: Zufall (Random)', 'cyan');
    log('═══════════════════════════════════════════════════', 'cyan');
    
    const pattern = {
        id: 'test-zufall',
        name: 'Zufall Test',
        type: 'preset',
        sourcePreset: 'Zufall',
        params: { minIntensity: 25, maxIntensity: 75, frequency: 2 },
        duration: 3000
    };

    log('Pattern: Zufällige Intensität 25-75% bei 2Hz', 'yellow');
    
    const engine = new PatternEngine(pattern, () => {});
    const keyframes = engine.keyframes;
    
    log(`Generierte ${keyframes.length} Keyframes`, 'blue');
    keyframes.forEach((kf, i) => {
        log(`  KF${i + 1}: ${kf.time}ms @ ${kf.intensity}% (${kf.interpolation})`, 'blue');
    });

    // Execute random pattern
    log('Sende Zufalls-Sequenz...', 'magenta');
    for (let i = 0; i < keyframes.length; i++) {
        const kf = keyframes[i];
        log(`  Random ${i + 1}/${keyframes.length}: ${kf.intensity}%`, 'magenta');
        await client.sendControl(shocker.id, 2, kf.intensity, 400);
        await sleep(500);
    }
    
    log('✓ Pattern 5 abgeschlossen', 'green');
    return true;
}

// Main test execution
async function main() {
    console.log('\n');
    log('╔═══════════════════════════════════════════════════╗', 'cyan');
    log('║   OpenShock Pattern System - 5 Pattern Test     ║', 'cyan');
    log('╚═══════════════════════════════════════════════════╝', 'cyan');
    console.log('\n');

    const client = new OpenShockClient(API_KEY);

    try {
        // Get devices
        log('Lade Geräte...', 'blue');
        const devices = await client.getDevices();
        
        if (devices.length === 0) {
            log('❌ Keine Geräte gefunden!', 'red');
            return;
        }

        log(`✓ ${devices.length} Gerät(e) gefunden`, 'green');
        console.log('');
        
        for (const device of devices) {
            log(`📱 ${device.name}`, 'blue');
            log(`   Status: ${device.online ? '🟢 Online' : '🔴 Offline'}`, device.online ? 'green' : 'red');
            log(`   Shockers: ${device.shockers.length}`, 'blue');
            for (const shocker of device.shockers) {
                log(`     - Shocker ${shocker.id}${shocker.name ? ` (${shocker.name})` : ''}`, 'blue');
            }
        }
        
        console.log('\n');

        // Get first available shocker
        const firstDevice = devices[0];
        const firstShocker = firstDevice.shockers[0];
        
        log(`Verwende: ${firstDevice.name} - Shocker ${firstShocker.id}`, 'yellow');
        console.log('\n');

        // Wait before starting
        log('Starte Tests in 3 Sekunden...', 'yellow');
        await sleep(3000);
        console.log('\n');

        // Track results
        const results = {
            total: 5,
            passed: 0,
            failed: 0
        };

        // Test all 5 patterns
        try {
            await testPattern1_Konstant(client, firstShocker);
            results.passed++;
            await sleep(1000);
        } catch (error) {
            log(`✗ Pattern 1 fehlgeschlagen: ${error.message}`, 'red');
            results.failed++;
        }

        try {
            await testPattern2_Rampe(client, firstShocker);
            results.passed++;
            await sleep(1000);
        } catch (error) {
            log(`✗ Pattern 2 fehlgeschlagen: ${error.message}`, 'red');
            results.failed++;
        }

        try {
            await testPattern3_Puls(client, firstShocker);
            results.passed++;
            await sleep(1000);
        } catch (error) {
            log(`✗ Pattern 3 fehlgeschlagen: ${error.message}`, 'red');
            results.failed++;
        }

        try {
            await testPattern4_Welle(client, firstShocker);
            results.passed++;
            await sleep(1000);
        } catch (error) {
            log(`✗ Pattern 4 fehlgeschlagen: ${error.message}`, 'red');
            results.failed++;
        }

        try {
            await testPattern5_Zufall(client, firstShocker);
            results.passed++;
            await sleep(1000);
        } catch (error) {
            log(`✗ Pattern 5 fehlgeschlagen: ${error.message}`, 'red');
            results.failed++;
        }

        // Summary
        console.log('\n');
        log('═══════════════════════════════════════════════════', 'cyan');
        log('TEST ZUSAMMENFASSUNG', 'cyan');
        log('═══════════════════════════════════════════════════', 'cyan');
        log(`Gesamt: ${results.total} Patterns`, 'blue');
        log(`Erfolgreich: ${results.passed}`, 'green');
        log(`Fehlgeschlagen: ${results.failed}`, results.failed > 0 ? 'red' : 'blue');
        log(`Erfolgsrate: ${Math.round((results.passed / results.total) * 100)}%`, results.passed === results.total ? 'green' : 'yellow');
        console.log('\n');

        if (results.passed === results.total) {
            log('╔═══════════════════════════════════════════════════╗', 'green');
            log('║   ✓ ALLE TESTS ERFOLGREICH!                     ║', 'green');
            log('╚═══════════════════════════════════════════════════╝', 'green');
        } else {
            log('⚠ Einige Tests sind fehlgeschlagen', 'yellow');
        }

    } catch (error) {
        log(`Fehler: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    }
}

// Run tests
if (require.main === module) {
    main().catch(error => {
        log(`Unerwarteter Fehler: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    });
}

module.exports = { OpenShockClient };
