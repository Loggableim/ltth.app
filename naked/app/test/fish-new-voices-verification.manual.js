/**
 * Fish.audio New Voices Verification Test
 * 
 * Tests that all requested voices from the issue have been added to Fish TTS system.
 * 
 * Run with: node app/test/fish-new-voices-verification.test.js
 */

console.log('\n='.repeat(70));
console.log('Fish.audio New Voices Verification Test');
console.log('='.repeat(70));

const fs = require('fs');
const path = require('path');

console.log('\n--- Test: Verify New Voices Are Present ---\n');

// Read the fishspeech-engine.js file directly
const enginePath = path.join(__dirname, '../plugins/tts/engines/fishspeech-engine.js');
const engineContent = fs.readFileSync(enginePath, 'utf-8');

// Define expected new voices with their reference IDs
const expectedNewVoices = [
    { id: 'fish-erzaehler-1-tief', reference_id: '40f470ff12064bf1897215b41819147c', name: 'Erzähler 1 Tief' },
    { id: 'fish-erzaehler-2-tief', reference_id: 'f55aa5a0cad04ab193261367c5faa9e9', name: 'Erzähler 2 Tief' },
    { id: 'fish-homer-simpson-de', reference_id: '56756fa804fc43e0b7d701e0e6b601ac', name: 'Homer Simpson DE' },
    { id: 'fish-kind-von-oben', reference_id: '57887823e98a48e0a7c01819628ba59b', name: 'Kind von Oben' },
    { id: 'fish-jean-luc-picard-de', reference_id: 'da4e5c72580947ff99c14e6a187dd21a', name: 'Jean Luc Picard DE' },
    { id: 'fish-bahnansage-2', reference_id: '3686c68c781a4c719439f9244e0e5125', name: 'Bahnansage 2' },
    { id: 'fish-dumbledore-de', reference_id: 'bbe1ddaa9dfc4f5187e8ba527c1595c6', name: 'Dumbledore DE' },
    { id: 'fish-erzaehler-de-3', reference_id: '53626294bf79412c905b28a7da814791', name: 'Erzähler DE 3' },
    { id: 'fish-marco-hagemann', reference_id: 'eaf0a55837fd4afd94630e1741e6da87', name: 'Marco Hagemann Moderator' },
    { id: 'fish-die-drei-fragezeichen', reference_id: 'c3de8320141046269db419db81c91869', name: 'Die 3 ??? Erzähler' },
    { id: 'fish-resident-evil-en', reference_id: 'ef9c79b62ef34530bf452c0e50e3c260', name: 'Resident Evil EN' },
    { id: 'fish-joker-en', reference_id: 'fad5a5a6770e47019f566b8f8c0ff609', name: 'Joker EN' },
    { id: 'fish-erzaehler-en-1', reference_id: 'b97618c195814c9fb7558ea34093cd28', name: 'Erzähler EN 1' },
    { id: 'fish-erzaehler-en-2', reference_id: 'c8c398f58ea74012969c3d9e51dd086c', name: 'Erzähler EN 2' },
    { id: 'fish-old-wizard', reference_id: '0e73b5c5ff5740cd8d85571454ef28ae', name: 'Old Wizard' },
    { id: 'fish-dexter-morgan', reference_id: 'a5971a1fd805441aaf3b0bbe8c9f1ab6', name: 'Dexter Morgan' },
    { id: 'fish-peter-griffin', reference_id: 'd75c270eaee14c8aa1e9e980cc37cf1b', name: 'Peter Griffin' },
    { id: 'fish-sonic-hedgehog', reference_id: '48484faae07e4cfdb8064da770ee461e', name: 'Sonic the Hedgehog' },
    { id: 'fish-shadow-hedgehog', reference_id: '7eb5c086a3864b109eac101ec3feb06e', name: 'Shadow the Hedgehog' },
    { id: 'fish-mortal-kombat-en', reference_id: 'd13f84b987ad4f22b56d2b47f4eb838e', name: 'Mortal Kombat EN' },
    { id: 'fish-steve-jobs', reference_id: 'b27c6c896db64f96842e12dc6f6a07d2', name: 'Steve Jobs EN' },
    { id: 'fish-david-attenborough', reference_id: 'c39a76f685cf4f8fb41cd5d3d66b497d', name: 'David Attenborough' },
    { id: 'fish-keanu-reeves', reference_id: 'b3f50c9e578f48e9a7db2f86cb3edde8', name: 'Keanu Reeves' },
    { id: 'fish-brian-griffin', reference_id: 'df7b23b4d67c4340be1170ae6cbc2913', name: 'Brian Griffin EN' },
    { id: 'fish-obama', reference_id: 'a7a0826352d240878d6a6566b61e4a61', name: 'Obama' },
    { id: 'fish-joe-rogan', reference_id: '0a8f443cf9c34f6f848e01ea7260c549', name: 'Joe Rogan' },
    { id: 'fish-joe-biden', reference_id: '9b42223616644104a4534968cd612053', name: 'Joe Biden' },
    { id: 'fish-deadpool', reference_id: 'd657aa381ad444e393d7f6ff0f8cc2f0', name: 'Deadpool' },
    { id: 'fish-tommy-shelby', reference_id: '873041090cf440faaf0fbd7deadd9b86', name: 'Tommy Shelby UK' },
    { id: 'fish-eric-cartman', reference_id: 'b4f55643a15944e499defe42964d2ebf', name: 'Eric Cartman US' },
    { id: 'fish-patrick-star', reference_id: 'd1520b60870b4e9aa01eab5bfefb1c45', name: 'Patrick Star US' },
    { id: 'fish-grandpa-us', reference_id: '697a707402bf47e9940b95a5f85fbe94', name: 'Grandpa US' },
    { id: 'fish-sorting-hat', reference_id: 'c944589a55ad450e8109d39cd3ecc488', name: 'Sorting Hat Hogwarts' }
];

// Verify existing voices that were already in the system
const existingVoices = [
    { id: 'fish-synchronstimme-1-frau', reference_id: '6c0670e7ae4e41e3a3523c33e6e2650f', name: 'SynchronFrau Sigma' },
    { id: 'fish-spongebob', reference_id: '5ea97971497248e085ead9fad68f4011', name: 'Spongebob Deutsch' },
    { id: 'fish-computerheld-mann', reference_id: 'aba15f4d197c45d48feba4af8f021c2b', name: 'Red Alert DE' }
];

let passedCount = 0;
let failedCount = 0;

console.log('Checking for newly added voices:\n');

expectedNewVoices.forEach((expected) => {
    // Check if the voice ID exists in the file
    const voiceIdPattern = new RegExp(`'${expected.id}':\\s*{`, 'g');
    const referenceIdPattern = new RegExp(`reference_id:\\s*'${expected.reference_id}'`, 'g');
    
    const hasVoiceId = voiceIdPattern.test(engineContent);
    const hasReferenceId = referenceIdPattern.test(engineContent);
    
    if (hasVoiceId && hasReferenceId) {
        console.log(`✓ ${expected.id} - ${expected.name}`);
        console.log(`  Reference ID: ${expected.reference_id}`);
        passedCount++;
    } else if (hasVoiceId) {
        console.error(`✗ ${expected.id} - Voice found but Reference ID mismatch!`);
        console.error(`  Expected: ${expected.reference_id}`);
        failedCount++;
    } else {
        console.error(`✗ ${expected.id} - Voice NOT FOUND!`);
        failedCount++;
    }
});

console.log('\nVerifying existing voices (should already be present):\n');

existingVoices.forEach((existing) => {
    const voiceIdPattern = new RegExp(`'${existing.id}':\\s*{`, 'g');
    const referenceIdPattern = new RegExp(`reference_id:\\s*'${existing.reference_id}'`, 'g');
    
    const hasVoiceId = voiceIdPattern.test(engineContent);
    const hasReferenceId = referenceIdPattern.test(engineContent);
    
    if (hasVoiceId && hasReferenceId) {
        console.log(`✓ ${existing.id} - ${existing.name} (already existed)`);
        console.log(`  Reference ID: ${existing.reference_id}`);
    } else if (hasVoiceId) {
        console.error(`✗ ${existing.id} - Voice found but Reference ID changed!`);
        console.error(`  Expected: ${existing.reference_id}`);
    } else {
        console.error(`✗ ${existing.id} - Voice MISSING (should have existed)!`);
    }
});

console.log('\n' + '='.repeat(70));
console.log('Test Results Summary');
console.log('='.repeat(70));
console.log(`New voices passed: ${passedCount}/${expectedNewVoices.length}`);
console.log(`New voices failed: ${failedCount}/${expectedNewVoices.length}`);
console.log('='.repeat(70));

if (failedCount > 0) {
    console.error('\n❌ TEST FAILED: Some voices are missing or have incorrect reference IDs');
    process.exit(1);
} else {
    console.log('\n✅ TEST PASSED: All new voices successfully added to Fish TTS system!');
    console.log('\n📝 Summary:');
    console.log(`   - ${expectedNewVoices.length} new voices added`);
    console.log(`   - ${existingVoices.length} voices already existed (verified)`);
    
    // Count total voices in file
    const voiceMatches = engineContent.match(/'fish-[^']+': {/g);
    const totalVoices = voiceMatches ? voiceMatches.length : 0;
    console.log(`   - Total Fish.audio voices: ${totalVoices}`);
    process.exit(0);
}
