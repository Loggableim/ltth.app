/**
 * Standalone verification script for AnimazingPal Persona System
 * Runs without Jest - verifies the persona system implementation
 */

const Database = require('better-sqlite3');
const path = require('path');

console.log('🧪 AnimazingPal Persona System Verification\n');

// Load modules
let MemoryDatabase, BrainEngine;
try {
  MemoryDatabase = require('../../animazingpal/brain/memory-database');
  BrainEngine = require('../../animazingpal/brain/brain-engine');
  console.log('✅ Modules loaded successfully\n');
} catch (err) {
  console.error('❌ Failed to load modules:', err.message);
  process.exit(1);
}

// Setup
const mockDb = new Database(':memory:');
const mockLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {}
};

const mockApi = {
  log: (msg, level) => mockLogger[level || 'info'](msg),
  getDatabase: () => mockDb,
  getSocketIO: () => ({ emit: () => {} }),
  emit: () => {}
};

const memoryDb = new MemoryDatabase(mockDb, mockLogger);
memoryDb.initialize();

// Test 1: Database Schema
console.log('Test 1: Database Schema');
const tableInfo = mockDb.prepare(`PRAGMA table_info(animazingpal_personalities)`).all();
const fieldNames = tableInfo.map(col => col.name);

if (fieldNames.includes('tone_settings') && 
    fieldNames.includes('emote_config') && 
    fieldNames.includes('memory_behavior')) {
  console.log('  ✅ All new fields present (tone_settings, emote_config, memory_behavior)');
} else {
  console.log('  ❌ Missing fields');
  process.exit(1);
}

// Test 2: Default Personas
console.log('\nTest 2: Default Personas');
const personas = memoryDb.getPersonalities();
console.log(`  Found ${personas.length} personas`);

const expectedPersonas = ['friendly_streamer', 'gaming_pro', 'entertainer', 'chill_vibes', 'anime_fan'];
let allFound = true;
expectedPersonas.forEach(name => {
  const persona = personas.find(p => p.name === name);
  if (persona) {
    console.log(`  ✅ ${name}: ${persona.display_name}`);
    
    // Check attributes
    const toneSettings = JSON.parse(persona.tone_settings);
    const emoteConfig = JSON.parse(persona.emote_config);
    const memoryBehavior = JSON.parse(persona.memory_behavior);
    
    console.log(`     - Temperature: ${toneSettings.temperature}`);
    console.log(`     - Default Emote: ${emoteConfig.defaultEmote}`);
    console.log(`     - Max Context Memories: ${memoryBehavior.maxContextMemories}`);
  } else {
    console.log(`  ❌ ${name} not found`);
    allFound = false;
  }
});

if (!allFound) process.exit(1);

// Test 3: Create Custom Persona
console.log('\nTest 3: Create Custom Persona');
const newPersona = {
  name: 'test_persona',
  display_name: 'Test Persona',
  description: 'A test persona for verification',
  system_prompt: 'You are a test persona',
  voice_style: 'test',
  tone_settings: { temperature: 0.8, presencePenalty: 0.4, frequencyPenalty: 0.3 },
  emote_config: { defaultEmote: 'smile', highEnergyEmote: 'excited', lowEnergyEmote: 'calm' },
  memory_behavior: { importanceThreshold: 0.5, maxContextMemories: 10 }
};

const id = memoryDb.createPersonality(newPersona);
console.log(`  ✅ Created persona with ID: ${id}`);

const created = memoryDb.getPersonalities().find(p => p.name === 'test_persona');
if (created && created.is_custom === 1) {
  console.log(`  ✅ Persona verified: ${created.display_name} (custom: ${created.is_custom})`);
} else {
  console.log('  ❌ Persona not found or not marked as custom');
  process.exit(1);
}

// Test 4: Update Persona
console.log('\nTest 4: Update Persona');
memoryDb.updatePersonality('test_persona', { display_name: 'Updated Test' });
const updated = memoryDb.getPersonalities().find(p => p.name === 'test_persona');
if (updated.display_name === 'Updated Test') {
  console.log('  ✅ Persona updated successfully');
} else {
  console.log('  ❌ Persona update failed');
  process.exit(1);
}

// Test 5: Set Active Persona
console.log('\nTest 5: Set Active Persona');
memoryDb.setActivePersonality('gaming_pro');
const active = memoryDb.getActivePersonality();
if (active && active.name === 'gaming_pro' && active.is_active === 1) {
  console.log(`  ✅ Active persona set: ${active.display_name}`);
} else {
  console.log('  ❌ Failed to set active persona');
  process.exit(1);
}

// Test 6: Delete Custom Persona
console.log('\nTest 6: Delete Custom Persona');
const deleted = memoryDb.deletePersonality('test_persona');
if (deleted) {
  console.log('  ✅ Custom persona deleted');
} else {
  console.log('  ❌ Failed to delete custom persona');
  process.exit(1);
}

const deletedDefault = memoryDb.deletePersonality('friendly_streamer');
if (!deletedDefault) {
  console.log('  ✅ Default persona protected from deletion');
} else {
  console.log('  ❌ Default persona should not be deletable');
  process.exit(1);
}

// Test 7: BrainEngine Integration
console.log('\nTest 7: BrainEngine Integration');
(async () => {
  const brainEngine = new BrainEngine(mockApi);
  await brainEngine.initialize();
  
  memoryDb.setActivePersonality('chill_vibes');
  await brainEngine.loadActivePersonality();
  
  if (brainEngine.currentPersonality && brainEngine.currentPersonality.name === 'chill_vibes') {
    console.log(`  ✅ BrainEngine loaded persona: ${brainEngine.currentPersonality.display_name}`);
    console.log(`     - Parsed tone_settings: ${typeof brainEngine.currentPersonality.tone_settings}`);
    console.log(`     - Parsed emote_config: ${typeof brainEngine.currentPersonality.emote_config}`);
    console.log(`     - Parsed memory_behavior: ${typeof brainEngine.currentPersonality.memory_behavior}`);
  } else {
    console.log('  ❌ BrainEngine failed to load persona');
    process.exit(1);
  }
  
  // Test get all personalities
  const allPersonas = brainEngine.getPersonalities();
  if (allPersonas.length > 0 && typeof allPersonas[0].tone_settings === 'object') {
    console.log(`  ✅ BrainEngine.getPersonalities() returns ${allPersonas.length} parsed personas`);
  } else {
    console.log('  ❌ BrainEngine.getPersonalities() failed');
    process.exit(1);
  }
  
  // Test create via BrainEngine
  const brainPersonaId = brainEngine.createPersonality({
    name: 'brain_test',
    display_name: 'Brain Test',
    system_prompt: 'Test'
  });
  if (brainPersonaId > 0) {
    console.log(`  ✅ BrainEngine.createPersonality() works (ID: ${brainPersonaId})`);
  } else {
    console.log('  ❌ BrainEngine.createPersonality() failed');
    process.exit(1);
  }
  
  // Test get single persona
  const singlePersona = brainEngine.getPersonality('brain_test');
  if (singlePersona && singlePersona.display_name === 'Brain Test') {
    console.log(`  ✅ BrainEngine.getPersonality() works`);
  } else {
    console.log('  ❌ BrainEngine.getPersonality() failed');
    process.exit(1);
  }
  
  // Cleanup
  mockDb.close();
  
  console.log('\n✨ All tests passed! Persona system working correctly.\n');
})().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
