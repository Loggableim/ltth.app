/**
 * Speechify Engine Diagnostic Test
 * 
 * This script demonstrates the new diagnostic capabilities of the Speechify engine.
 * It tests connectivity, error handling, and provides helpful troubleshooting information.
 * 
 * Usage:
 *   node test-speechify-diagnostics.js [API_KEY]
 * 
 * Example:
 *   node test-speechify-diagnostics.js your-api-key-here
 */

const SpeechifyEngine = require('./speechify-engine');

// Mock logger
const logger = {
    info: (...args) => console.log('ℹ️ [INFO]', ...args),
    warn: (...args) => console.warn('⚠️ [WARN]', ...args),
    error: (...args) => console.error('❌ [ERROR]', ...args),
    debug: (...args) => console.log('🔍 [DEBUG]', ...args)
};

async function runDiagnostics() {
    console.log('\n' + '='.repeat(80));
    console.log('SPEECHIFY ENGINE DIAGNOSTIC TEST');
    console.log('='.repeat(80) + '\n');

    // Get API key from command line or use dummy key for connectivity testing
    const apiKey = process.argv[2] || 'test-key-for-connectivity-check';
    
    if (apiKey === 'test-key-for-connectivity-check') {
        console.log('⚠️  No API key provided - using dummy key for connectivity test');
        console.log('   (Auth will fail, but network diagnostics will still work)\n');
        console.log('   Usage: node test-speechify-diagnostics.js YOUR_API_KEY\n');
    }

    try {
        // Initialize engine
        console.log('📝 Initializing Speechify engine...\n');
        const engine = new SpeechifyEngine(apiKey, logger, { 
            performanceMode: 'balanced' 
        });

        // Display engine info
        console.log('ℹ️  Engine Information:');
        const info = engine.getInfo();
        console.log('   Base URL:', info.apiBaseUrl);
        console.log('   Timeout:', info.timeout + 'ms');
        console.log('   Max Retries:', info.maxRetries);
        console.log('   Cache TTL:', (info.cacheTTL / 3600000).toFixed(1) + ' hours');
        console.log('   Price per 1k chars:', '$' + info.pricePerKChars.toFixed(4));
        console.log('\n');

        // Run network diagnostics
        console.log('🔍 Running network connectivity diagnostics...\n');
        const diagnostics = await engine.testConnectivity();

        // Display results
        console.log('\n' + '='.repeat(80));
        console.log('DIAGNOSTIC RESULTS');
        console.log('='.repeat(80) + '\n');

        console.log('📊 Summary:');
        console.log('   DNS Resolution:', diagnostics.results.dnsResolution);
        console.log('   Voices Endpoint:', diagnostics.results.voicesEndpoint);
        console.log('   Synthesis Endpoint:', diagnostics.results.synthesisEndpoint);
        console.log('   Authentication:', diagnostics.results.authentication);

        if (diagnostics.errors.length > 0) {
            console.log('\n❌ Errors:');
            diagnostics.errors.forEach((err, idx) => {
                console.log(`   ${idx + 1}. ${err}`);
            });
        }

        // Recommendations based on results
        console.log('\n💡 Recommendations:');
        
        if (diagnostics.results.dnsResolution === 'failed') {
            console.log('   ⚠️  DNS ISSUE: Cannot resolve api.sws.speechify.com');
            console.log('      → Check DNS settings (try 8.8.8.8 or 1.1.1.1)');
            console.log('      → Verify firewall allows DNS queries');
            console.log('      → Check if running in restricted network');
        }
        
        if (diagnostics.results.voicesEndpoint === 'connection-refused') {
            console.log('   ⚠️  CONNECTION BLOCKED: Firewall or proxy blocking');
            console.log('      → Check firewall rules for outbound HTTPS');
            console.log('      → Whitelist api.sws.speechify.com');
            console.log('      → Verify port 443 is open');
        }
        
        if (diagnostics.results.authentication === 'invalid') {
            console.log('   ⚠️  AUTH ISSUE: API key is invalid');
            console.log('      → Get valid key from https://console.speechify.com');
            console.log('      → Check if key has expired');
            console.log('      → Verify billing is active');
        }
        
        if (diagnostics.results.authentication === 'valid') {
            console.log('   ✅ All systems operational!');
            console.log('      → Speechify is properly configured');
            console.log('      → Ready for text-to-speech synthesis');
        }

        console.log('\n📖 Documentation: https://docs.sws.speechify.com');
        console.log('🔧 Troubleshooting: See TROUBLESHOOTING.md');
        console.log('\n' + '='.repeat(80) + '\n');

    } catch (error) {
        console.error('\n❌ Fatal error during diagnostics:');
        console.error('   ', error.message);
        console.error('\n   Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run diagnostics
runDiagnostics().catch(error => {
    console.error('\n💥 Unhandled error:', error);
    process.exit(1);
});
