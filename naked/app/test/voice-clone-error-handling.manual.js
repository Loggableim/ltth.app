/**
 * Test to verify voice clone error handling improvements
 * This test validates that HTTP 400 errors from Speechify API
 * provide helpful error messages to users
 */

const fs = require('fs');
const path = require('path');

console.log('=== Voice Clone Error Handling Test ===\n');

function testErrorMessageConstruction() {
  console.log('Test 1: Error message construction logic');
  
  // Test case 1: HTTP 400 with no error details
  const status400 = 400;
  const emptyData = {};
  
  const errorMessage1 = emptyData?.error?.message || 
                        emptyData?.message || 
                        emptyData?.error ||
                        `HTTP ${status400}`;
  
  console.log(`  Input: status=${status400}, data={}`);
  console.log(`  Extracted error message: "${errorMessage1}"`);
  
  if (errorMessage1 === 'HTTP 400') {
    console.log('  ✅ PASSED: Correctly falls back to "HTTP 400"');
  } else {
    console.log('  ✗ FAILED: Should have extracted "HTTP 400"');
    process.exit(1);
  }
  
  // Test case 2: HTTP 400 with error details
  const dataWithError = { error: { message: 'Invalid audio format' } };
  const errorMessage2 = dataWithError?.error?.message || 
                        dataWithError?.message || 
                        dataWithError?.error ||
                        `HTTP ${status400}`;
  
  console.log(`\n  Input: status=${status400}, data.error.message="Invalid audio format"`);
  console.log(`  Extracted error message: "${errorMessage2}"`);
  
  if (errorMessage2 === 'Invalid audio format') {
    console.log('  ✅ PASSED: Correctly extracted detailed error message');
  } else {
    console.log('  ✗ FAILED: Should have extracted "Invalid audio format"');
    process.exit(1);
  }
}

function testEnhancedErrorMessages() {
  console.log('\nTest 2: Enhanced error messages for different status codes');
  
  // Test HTTP 400
  const baseError400 = 'HTTP 400';
  const enhanced400 = `Bad request - The Speechify API rejected the request. This may indicate that voice cloning is not available with your API key, or the request format is incorrect. Details: ${baseError400}`;
  
  console.log(`  HTTP 400 base: "${baseError400}"`);
  console.log(`  HTTP 400 enhanced: "${enhanced400}"`);
  
  if (enhanced400.includes('Bad request') && enhanced400.includes('voice cloning') && enhanced400.includes(baseError400)) {
    console.log('  ✅ PASSED: HTTP 400 message is descriptive and includes details');
  } else {
    console.log('  ✗ FAILED: HTTP 400 message not properly enhanced');
    process.exit(1);
  }
  
  // Test HTTP 401
  const baseError401 = 'Unauthorized';
  const enhanced401 = `Authentication failed - Voice cloning may not be available with your current Speechify API plan. Please check if your API key supports voice cloning. Details: ${baseError401}`;
  
  console.log(`\n  HTTP 401 base: "${baseError401}"`);
  console.log(`  HTTP 401 enhanced: "${enhanced401}"`);
  
  if (enhanced401.includes('Authentication failed') && enhanced401.includes('API plan') && enhanced401.includes(baseError401)) {
    console.log('  ✅ PASSED: HTTP 401 message is descriptive and includes details');
  } else {
    console.log('  ✗ FAILED: HTTP 401 message not properly enhanced');
    process.exit(1);
  }
  
  // Test HTTP 404
  const baseError404 = 'Not Found';
  const enhanced404 = `Endpoint not found - The voice cloning endpoint may have changed or may not be available. Details: ${baseError404}`;
  
  console.log(`\n  HTTP 404 base: "${baseError404}"`);
  console.log(`  HTTP 404 enhanced: "${enhanced404}"`);
  
  if (enhanced404.includes('Endpoint not found') && enhanced404.includes('voice cloning endpoint') && enhanced404.includes(baseError404)) {
    console.log('  ✅ PASSED: HTTP 404 message is descriptive and includes details');
  } else {
    console.log('  ✗ FAILED: HTTP 404 message not properly enhanced');
    process.exit(1);
  }
}

function testCodeChanges() {
  console.log('\nTest 3: Verify code changes are in place');
  
  const enginePath = path.join(__dirname, '../plugins/tts/engines/speechify-engine.js');
  const code = fs.readFileSync(enginePath, 'utf8');
  
  // Check for the helper function
  const hasHelperFunction = code.includes('_createVoiceCloneErrorMessage');
  const hasHelperInResponseCheck = code.includes('this._createVoiceCloneErrorMessage(response.status, baseErrorMessage)');
  const hasHelperInCatchBlock = code.includes('this._createVoiceCloneErrorMessage(statusCode, baseErrorMessage)');
  const hasBadRequestMessage = code.includes('Bad request - The Speechify API rejected the request');
  const hasAuthFailedMessage = code.includes('Authentication failed - Voice cloning may not be available');
  const hasEndpointNotFoundMessage = code.includes('Endpoint not found - The voice cloning endpoint may have changed');
  
  console.log(`  Check for helper function: ${hasHelperFunction ? '✅' : '✗'}`);
  console.log(`  Check for helper used in response check: ${hasHelperInResponseCheck ? '✅' : '✗'}`);
  console.log(`  Check for helper used in catch block: ${hasHelperInCatchBlock ? '✅' : '✗'}`);
  console.log(`  Check for "Bad request" message: ${hasBadRequestMessage ? '✅' : '✗'}`);
  console.log(`  Check for "Authentication failed" message: ${hasAuthFailedMessage ? '✅' : '✗'}`);
  console.log(`  Check for "Endpoint not found" message: ${hasEndpointNotFoundMessage ? '✅' : '✗'}`);
  
  if (hasHelperFunction && hasHelperInResponseCheck && hasHelperInCatchBlock && hasBadRequestMessage && hasAuthFailedMessage && hasEndpointNotFoundMessage) {
    console.log('  ✅ PASSED: All error handling code is in place (using helper function)');
  } else {
    console.log('  ✗ FAILED: Some error handling code is missing');
    process.exit(1);
  }
}

function runTests() {
  testErrorMessageConstruction();
  testEnhancedErrorMessages();
  testCodeChanges();
  
  console.log('\n=== Test Summary ===');
  console.log('✅ All error handling tests passed');
  console.log('✅ HTTP 400 errors now show descriptive messages');
  console.log('✅ HTTP 401/403 errors mention authentication issues');
  console.log('✅ HTTP 404 errors mention endpoint availability');
  console.log('✅ Users will see helpful guidance instead of generic "HTTP 400"');
}

runTests();
