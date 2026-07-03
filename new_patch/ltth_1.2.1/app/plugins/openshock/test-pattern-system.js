/**
 * @file test-pattern-system.js - Test script for Pattern System with real devices
 * @description Tests the pattern engine and sends commands to OpenShock devices
 */

const https = require('https');

// Configuration
const API_KEY = '6PP4UFqvQg1sWEyWKTD30dvbBMLfwtaW5sPwfopq8HKBSNIQYxdabBV0fANe623m';
const BASE_URL = 'api.openshock.app';

// Color logging
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
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

                res.on('data', (chunk) => {
                    data += chunk;
                });

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
                    type: type, // 0=Stop, 1=Shock, 2=Vibrate, 3=Sound
                    intensity: Math.round(intensity),
                    duration: Math.round(duration),
                    exclusive: false
                }],
                customName: 'Pattern System Test'
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

                res.on('data', (chunk) => {
                    data += chunk;
                });

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

// Helper function to sleep
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Test patterns
async function testBasicCommands(client, shocker) {
    log('=== Test 1: Basis-Befehle ===', 'cyan');
    
    // Sound/Beep
    log('Sende Sound (Beep)...', 'blue');
    await client.sendControl(shocker.id, 3, 50, 500);
    await sleep(800);
    
    // Vibration
    log('Sende Vibration...', 'blue');
    await client.sendControl(shocker.id, 2, 50, 1000);
    await sleep(1300);
    
    // Shock
    log('Sende Shock...', 'blue');
    await client.sendControl(shocker.id, 1, 30, 500);
    await sleep(800);
    
    log('✓ Basis-Befehle Test abgeschlossen', 'green');
}

async function testCombinedPattern(client, shocker) {
    log('=== Test 2: Kombiniertes Pattern ===', 'cyan');
    
    const pattern = [
        { name: 'Beep Start', type: 3, intensity: 40, duration: 200 },
        { name: 'Pause', duration: 300 },
        { name: 'Leichte Vibration', type: 2, intensity: 30, duration: 500 },
        { name: 'Pause', duration: 200 },
        { name: 'Shock Impuls 1', type: 1, intensity: 25, duration: 300 },
        { name: 'Pause', duration: 400 },
        { name: 'Shock Impuls 2', type: 1, intensity: 35, duration: 300 },
        { name: 'Pause', duration: 400 },
        { name: 'Shock Impuls 3', type: 1, intensity: 45, duration: 300 },
        { name: 'Pause', duration: 500 },
        { name: 'Vibration Fade', type: 2, intensity: 50, duration: 1000 },
        { name: 'Beep Ende', type: 3, intensity: 40, duration: 200 }
    ];

    for (const step of pattern) {
        log(`  → ${step.name}`, 'yellow');
        if (step.type !== undefined) {
            await client.sendControl(shocker.id, step.type, step.intensity, step.duration);
        }
        await sleep(step.duration + 100);
    }
    
    log('✓ Kombiniertes Pattern abgeschlossen', 'green');
}

async function testPulsePattern(client, shocker) {
    log('=== Test 3: Puls-Pattern ===', 'cyan');
    
    const pulses = [
        { intensity: 30, duration: 300 },
        { intensity: 40, duration: 300 },
        { intensity: 50, duration: 300 },
        { intensity: 40, duration: 300 },
        { intensity: 30, duration: 300 }
    ];

    for (let i = 0; i < pulses.length; i++) {
        log(`  Puls ${i + 1}/${pulses.length} - ${pulses[i].intensity}%`, 'yellow');
        await client.sendControl(shocker.id, 1, pulses[i].intensity, pulses[i].duration);
        await sleep(pulses[i].duration + 200);
    }
    
    log('✓ Puls-Pattern abgeschlossen', 'green');
}

async function testRampPattern(client, shocker) {
    log('=== Test 4: Rampen-Pattern (Ansteigende Intensität) ===', 'cyan');
    
    const steps = 5;
    const stepDuration = 400;
    const startIntensity = 20;
    const endIntensity = 60;

    for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const intensity = Math.round(startIntensity + (endIntensity - startIntensity) * progress);
        log(`  Rampe Schritt ${i + 1}/${steps + 1} - ${intensity}%`, 'yellow');
        await client.sendControl(shocker.id, 2, intensity, stepDuration); // Use vibration for ramp
        await sleep(stepDuration + 100);
    }
    
    log('✓ Rampen-Pattern abgeschlossen', 'green');
}

async function testAllDevices(client, devices) {
    log('=== Test 5: Alle Geräte gleichzeitig ===', 'cyan');
    
    const allShockers = [];
    for (const device of devices) {
        for (const shocker of device.shockers) {
            allShockers.push({ deviceName: device.name, shocker });
        }
    }

    log(`Gefunden: ${allShockers.length} Shocker(s)`, 'blue');

    // Send to all devices
    for (const item of allShockers) {
        log(`  → ${item.deviceName} - Shocker ${item.shocker.id}`, 'yellow');
    }

    // Synchronized beep
    log('Sende synchronisierten Beep an alle Geräte...', 'blue');
    const promises = allShockers.map(item => 
        client.sendControl(item.shocker.id, 3, 50, 500)
    );
    await Promise.all(promises);
    await sleep(800);

    // Sequential shocks
    log('Sende sequentielle Shocks...', 'blue');
    for (const item of allShockers) {
        log(`  Shock: ${item.deviceName}`, 'yellow');
        await client.sendControl(item.shocker.id, 1, 35, 400);
        await sleep(600);
    }
    
    log('✓ Alle-Geräte Test abgeschlossen', 'green');
}

async function testHeartbeatPattern(client, shocker) {
    log('=== Test 6: Herzschlag-Pattern ===', 'cyan');
    
    const heartbeats = 3;
    for (let i = 0; i < heartbeats; i++) {
        log(`  Herzschlag ${i + 1}/${heartbeats}`, 'yellow');
        
        // First beat (stronger)
        await client.sendControl(shocker.id, 2, 60, 200);
        await sleep(250);
        
        // Second beat (weaker)
        await client.sendControl(shocker.id, 2, 40, 200);
        await sleep(250);
        
        // Pause between heartbeats
        await sleep(600);
    }
    
    log('✓ Herzschlag-Pattern abgeschlossen', 'green');
}

// Main test execution
async function main() {
    log('╔════════════════════════════════════════╗', 'cyan');
    log('║   OpenShock Pattern System Test      ║', 'cyan');
    log('╚════════════════════════════════════════╝', 'cyan');
    log('');

    const client = new OpenShockClient(API_KEY);

    try {
        // Get devices
        log('Lade Geräte...', 'blue');
        const devices = await client.getDevices();
        
        if (devices.length === 0) {
            log('Keine Geräte gefunden!', 'red');
            return;
        }

        log(`✓ ${devices.length} Gerät(e) gefunden`, 'green');
        
        for (const device of devices) {
            log(`  • ${device.name} (${device.online ? 'Online' : 'Offline'}) - ${device.shockers.length} Shocker(s)`, 'blue');
        }
        
        log('');

        // Get first available shocker
        const firstDevice = devices[0];
        const firstShocker = firstDevice.shockers[0];
        
        log(`Verwende Gerät: ${firstDevice.name}`, 'blue');
        log(`Verwende Shocker: ${firstShocker.id}`, 'blue');
        log('');

        // Wait before starting
        log('Starte Tests in 2 Sekunden...', 'yellow');
        await sleep(2000);
        log('');

        // Run tests
        await testBasicCommands(client, firstShocker);
        await sleep(1000);

        await testCombinedPattern(client, firstShocker);
        await sleep(1000);

        await testPulsePattern(client, firstShocker);
        await sleep(1000);

        await testRampPattern(client, firstShocker);
        await sleep(1000);

        if (devices.length > 1 || firstDevice.shockers.length > 1) {
            await testAllDevices(client, devices);
            await sleep(1000);
        }

        await testHeartbeatPattern(client, firstShocker);

        log('');
        log('╔════════════════════════════════════════╗', 'green');
        log('║   Alle Tests erfolgreich!            ║', 'green');
        log('╚════════════════════════════════════════╝', 'green');

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
