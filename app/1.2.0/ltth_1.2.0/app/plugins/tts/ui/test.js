/**
 * TTS Plugin Diagnostic Test Script
 */

const results = document.getElementById('results');

function addResult(test, status, message) {
    const div = document.createElement('div');
    div.className = `test ${status}`;
    div.innerHTML = `<strong>${test}:</strong> ${message}`;
    results.appendChild(div);
}

async function runTests() {
    // Test 1: JavaScript geladen
    addResult('Test 1', 'success', 'JavaScript wird ausgeführt ✓');

    // Test 2: API erreichbar
    try {
        const res = await fetch('/api/tts/config');
        if (res.ok) {
            const data = await res.json();
            addResult('Test 2', 'success', 'TTS Config API erreichbar ✓');
            addResult('Config', 'success', JSON.stringify(data.config, null, 2));
        } else {
            addResult('Test 2', 'error', `TTS Config API Error: ${res.status}`);
        }
    } catch (error) {
        addResult('Test 2', 'error', `TTS Config API nicht erreichbar: ${error.message}`);
    }

    // Test 3: Voices API
    try {
        const res = await fetch('/api/tts/voices?engine=all');
        if (res.ok) {
            const data = await res.json();
            const tiktokCount = Object.keys(data.voices.tiktok || {}).length;
            const googleCount = Object.keys(data.voices.google || {}).length;
            addResult('Test 3', 'success', `Voices API: ${tiktokCount} TikTok + ${googleCount} Google Stimmen ✓`);
        } else {
            addResult('Test 3', 'error', `Voices API Error: ${res.status}`);
        }
    } catch (error) {
        addResult('Test 3', 'error', `Voices API nicht erreichbar: ${error.message}`);
    }

    // Test 4: Plugin Status
    try {
        const res = await fetch('/api/plugins');
        if (res.ok) {
            const data = await res.json();
            const ttsPlugin = data.plugins.find(p => p.id === 'tts');
            if (ttsPlugin) {
                addResult('Test 4', 'success', `TTS Plugin Status: ${ttsPlugin.enabled ? 'ENABLED ✓' : 'DISABLED ✗'}`);
                addResult('Plugin Info', 'success', JSON.stringify(ttsPlugin, null, 2));
            } else {
                addResult('Test 4', 'error', 'TTS Plugin nicht in Plugin-Liste gefunden');
            }
        } else {
            addResult('Test 4', 'error', `Plugins API Error: ${res.status}`);
        }
    } catch (error) {
        addResult('Test 4', 'error', `Plugins API nicht erreichbar: ${error.message}`);
    }

    // Test 5: Socket.IO
    addResult('Test 5', 'pending', 'Socket.IO Test wird übersprungen (erfordert io laden)');

    // Test 6: Static Files
    try {
        const res = await fetch('/plugins/tts/plugin.json');
        if (res.ok) {
            const data = await res.json();
            addResult('Test 6', 'success', `Static Files: plugin.json geladen ✓ (v${data.version})`);
        } else {
            addResult('Test 6', 'error', `Static Files Error: ${res.status}`);
        }
    } catch (error) {
        addResult('Test 6', 'error', `Static Files nicht erreichbar: ${error.message}`);
    }

    // Test 7: Admin Panel JS
    try {
        const res = await fetch('/plugins/tts/ui/tts-admin.js');
        if (res.ok) {
            addResult('Test 7', 'success', `Admin Panel JS geladen ✓ (${res.headers.get('content-length')} bytes)`);
        } else {
            addResult('Test 7', 'error', `Admin Panel JS Error: ${res.status}`);
        }
    } catch (error) {
        addResult('Test 7', 'error', `Admin Panel JS nicht erreichbar: ${error.message}`);
    }

    addResult('Diagnose', 'success', 'Alle Tests abgeschlossen!');
}

// Run tests when DOM is ready
runTests();
