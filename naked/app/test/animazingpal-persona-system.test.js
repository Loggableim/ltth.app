/**
 * Tests for AnimazingPal Persona System
 * Tests standalone mode with customizable AI personas
 */

const assert = require('assert');

describe('AnimazingPal Persona System', function() {
  let MemoryDatabase;
  let BrainEngine;
  let mockDb;
  let mockApi;
  let memoryDb;
  let brainEngine;

  beforeAll(function() {
    // Load required modules
    try {
      MemoryDatabase = require('../plugins/animazingpal/brain/memory-database');
      BrainEngine = require('../plugins/animazingpal/brain/brain-engine');
    } catch (err) {
      console.log('Could not load modules, skipping tests:', err.message);
    }
  });

  beforeEach(function() {
    // Create mock database using in-memory SQLite
    if (!MemoryDatabase || !BrainEngine) {
      return;
    }

    const Database = require('better-sqlite3');
    mockDb = new Database(':memory:');
    
    // Create mock API
    const mockLogger = {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {}
    };
    
    mockApi = {
      log: (msg, level) => mockLogger[level || 'info'](msg),
      getDatabase: () => mockDb,
      getSocketIO: () => ({ emit: () => {} }),
      emit: () => {}
    };
    
    // Initialize memory database
    memoryDb = new MemoryDatabase(mockDb, mockLogger);
    memoryDb.initialize();
  });

  afterEach(function() {
    if (!MemoryDatabase || !BrainEngine) {
      return;
    }

    if (mockDb) {
      mockDb.close();
    }
  });

  describe('Persona Database Schema', function() {
    it('should have personas table with new fields', function() {
      const tableInfo = mockDb.prepare(`PRAGMA table_info(animazingpal_personalities)`).all();
      const fieldNames = tableInfo.map(col => col.name);
      
      assert.ok(fieldNames.includes('tone_settings'), 'Should have tone_settings field');
      assert.ok(fieldNames.includes('emote_config'), 'Should have emote_config field');
      assert.ok(fieldNames.includes('memory_behavior'), 'Should have memory_behavior field');
    });

    it('should have default personas with new attributes', function() {
      const personas = memoryDb.getPersonalities();
      
      assert.ok(personas.length > 0, 'Should have default personas');
      
      const friendlyStreamer = personas.find(p => p.name === 'friendly_streamer');
      assert.ok(friendlyStreamer, 'Should have friendly_streamer persona');
      assert.ok(friendlyStreamer.tone_settings, 'Should have tone_settings');
      assert.ok(friendlyStreamer.emote_config, 'Should have emote_config');
      assert.ok(friendlyStreamer.memory_behavior, 'Should have memory_behavior');
    });
  });

  describe('Persona CRUD Operations', function() {
    it('should create a custom persona', function() {
      const personaData = {
        name: 'test_persona',
        display_name: 'Test Persona',
        description: 'A test persona',
        system_prompt: 'You are a test persona',
        voice_style: 'test',
        emotion_tendencies: { happy: 0.5 },
        catchphrases: ['Test phrase'],
        topics_of_interest: ['Testing'],
        response_style: 'test',
        tone_settings: { temperature: 0.8, presencePenalty: 0.4, frequencyPenalty: 0.3 },
        emote_config: { defaultEmote: 'test', highEnergyEmote: 'test_high', lowEnergyEmote: 'test_low' },
        memory_behavior: { importanceThreshold: 0.5, maxContextMemories: 10 }
      };

      const id = memoryDb.createPersonality(personaData);
      assert.ok(id > 0, 'Should return valid ID');

      const personas = memoryDb.getPersonalities();
      const created = personas.find(p => p.name === 'test_persona');
      
      assert.ok(created, 'Should find created persona');
      assert.strictEqual(created.display_name, 'Test Persona');
      assert.strictEqual(created.is_custom, 1, 'Should be marked as custom');
    });

    it('should update a persona', function() {
      const updates = {
        display_name: 'Updated Name',
        tone_settings: { temperature: 0.9, presencePenalty: 0.5, frequencyPenalty: 0.4 }
      };

      memoryDb.updatePersonality('friendly_streamer', updates);

      const personas = memoryDb.getPersonalities();
      const updated = personas.find(p => p.name === 'friendly_streamer');
      
      assert.strictEqual(updated.display_name, 'Updated Name');
    });

    it('should delete custom persona only', function() {
      // Create custom persona
      const personaData = {
        name: 'deletable_persona',
        display_name: 'Deletable',
        system_prompt: 'Test'
      };
      memoryDb.createPersonality(personaData);

      // Try to delete custom persona
      const deleted = memoryDb.deletePersonality('deletable_persona');
      assert.strictEqual(deleted, true, 'Should delete custom persona');

      // Try to delete default persona
      const deletedDefault = memoryDb.deletePersonality('friendly_streamer');
      assert.strictEqual(deletedDefault, false, 'Should not delete default persona');
    });

    it('should set active persona', function() {
      memoryDb.setActivePersonality('gaming_pro');
      
      const active = memoryDb.getActivePersonality();
      assert.ok(active, 'Should have active persona');
      assert.strictEqual(active.name, 'gaming_pro');
      assert.strictEqual(active.is_active, 1);
    });
  });

  describe('BrainEngine Persona Integration', function() {
    beforeEach(async function() {
      brainEngine = new BrainEngine(mockApi);
      await brainEngine.initialize();
    });

    it('should load active persona with parsed fields', async function() {
      memoryDb.setActivePersonality('chill_vibes');
      await brainEngine.loadActivePersonality();

      assert.ok(brainEngine.currentPersonality, 'Should have current persona');
      assert.strictEqual(brainEngine.currentPersonality.name, 'chill_vibes');
      
      // Check parsed fields
      assert.ok(typeof brainEngine.currentPersonality.emotion_tendencies === 'object');
      assert.ok(Array.isArray(brainEngine.currentPersonality.catchphrases));
      assert.ok(typeof brainEngine.currentPersonality.tone_settings === 'object');
      assert.ok(typeof brainEngine.currentPersonality.emote_config === 'object');
      assert.ok(typeof brainEngine.currentPersonality.memory_behavior === 'object');
    });

    it('should get all personalities with parsed fields', function() {
      const personas = brainEngine.getPersonalities();
      
      assert.ok(personas.length > 0);
      personas.forEach(persona => {
        assert.ok(typeof persona.emotion_tendencies === 'object');
        assert.ok(Array.isArray(persona.catchphrases));
        assert.ok(typeof persona.tone_settings === 'object');
        assert.ok(typeof persona.emote_config === 'object');
        assert.ok(typeof persona.memory_behavior === 'object');
      });
    });

    it('should create persona via BrainEngine', function() {
      const personaData = {
        name: 'brain_test_persona',
        display_name: 'Brain Test',
        system_prompt: 'Test',
        tone_settings: { temperature: 0.7, presencePenalty: 0.3, frequencyPenalty: 0.2 }
      };

      const id = brainEngine.createPersonality(personaData);
      assert.ok(id > 0);

      const persona = brainEngine.getPersonality('brain_test_persona');
      assert.ok(persona);
      assert.strictEqual(persona.display_name, 'Brain Test');
    });

    it('should update persona and reload if active', async function() {
      memoryDb.setActivePersonality('friendly_streamer');
      await brainEngine.loadActivePersonality();

      const updates = { display_name: 'Updated Friendly' };
      brainEngine.updatePersonality('friendly_streamer', updates);

      // Should have reloaded current persona
      assert.strictEqual(brainEngine.currentPersonality.display_name, 'Updated Friendly');
    });

    it('should delete custom persona via BrainEngine', function() {
      // Create a custom persona first
      const personaData = {
        name: 'delete_test',
        display_name: 'Delete Test',
        system_prompt: 'Test'
      };
      brainEngine.createPersonality(personaData);

      // Delete it
      const deleted = brainEngine.deletePersonality('delete_test');
      assert.strictEqual(deleted, true);

      // Verify it's gone
      const persona = brainEngine.getPersonality('delete_test');
      assert.strictEqual(persona, undefined);
    });
  });

  describe('Persona Tone Settings', function() {
    it('should have valid tone settings structure', function() {
      const personas = memoryDb.getPersonalities();
      
      personas.forEach(persona => {
        const toneSettings = JSON.parse(persona.tone_settings);
        
        assert.ok('temperature' in toneSettings);
        assert.ok('presencePenalty' in toneSettings);
        assert.ok('frequencyPenalty' in toneSettings);
        
        assert.ok(toneSettings.temperature >= 0 && toneSettings.temperature <= 2);
        assert.ok(toneSettings.presencePenalty >= 0 && toneSettings.presencePenalty <= 2);
        assert.ok(toneSettings.frequencyPenalty >= 0 && toneSettings.frequencyPenalty <= 2);
      });
    });

    it('should have valid emote config structure', function() {
      const personas = memoryDb.getPersonalities();
      
      personas.forEach(persona => {
        const emoteConfig = JSON.parse(persona.emote_config);
        
        assert.ok('defaultEmote' in emoteConfig);
        assert.ok('highEnergyEmote' in emoteConfig);
        assert.ok('lowEnergyEmote' in emoteConfig);
        
        assert.ok(typeof emoteConfig.defaultEmote === 'string');
        assert.ok(typeof emoteConfig.highEnergyEmote === 'string');
        assert.ok(typeof emoteConfig.lowEnergyEmote === 'string');
      });
    });

    it('should have valid memory behavior structure', function() {
      const personas = memoryDb.getPersonalities();
      
      personas.forEach(persona => {
        const memoryBehavior = JSON.parse(persona.memory_behavior);
        
        assert.ok('importanceThreshold' in memoryBehavior);
        assert.ok('maxContextMemories' in memoryBehavior);
        
        assert.ok(memoryBehavior.importanceThreshold >= 0 && memoryBehavior.importanceThreshold <= 1);
        assert.ok(memoryBehavior.maxContextMemories > 0);
      });
    });
  });

  describe('Default Personas', function() {
    const expectedPersonas = ['friendly_streamer', 'gaming_pro', 'entertainer', 'chill_vibes', 'anime_fan'];

    expectedPersonas.forEach(personaName => {
      it(`should have ${personaName} persona with complete attributes`, function() {
        const personas = memoryDb.getPersonalities();
        const persona = personas.find(p => p.name === personaName);
        
        assert.ok(persona, `Should have ${personaName} persona`);
        assert.ok(persona.display_name);
        assert.ok(persona.description);
        assert.ok(persona.system_prompt);
        assert.ok(persona.tone_settings);
        assert.ok(persona.emote_config);
        assert.ok(persona.memory_behavior);
        assert.strictEqual(persona.is_custom, 0, 'Should not be custom');
      });
    });
  });
});
