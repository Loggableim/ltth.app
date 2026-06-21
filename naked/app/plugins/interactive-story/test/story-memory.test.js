const StoryMemory = require('../utils/story-memory');

describe('StoryMemory', () => {
  let memory;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    memory = new StoryMemory(mockLogger);
  });

  test('should initialize with empty memory', () => {
    expect(memory.memory.characters.size).toBe(0);
    expect(memory.memory.locations.size).toBe(0);
    expect(memory.memory.items.size).toBe(0);
    expect(memory.memory.events.length).toBe(0);
    expect(memory.memory.currentChapter).toBe(0);
  });

  test('should initialize story with theme and outline', () => {
    memory.initialize('fantasy', 'A hero embarks on a quest', { tone: 'epic' });
    
    expect(memory.memory.theme).toBe('fantasy');
    expect(memory.memory.outline).toBe('A hero embarks on a quest');
    expect(memory.memory.metadata.tone).toBe('epic');
  });

  test('should add and retrieve characters', () => {
    memory.addCharacter('Aragorn', {
      description: 'A ranger from the North',
      traits: ['brave', 'noble']
    });

    const char = memory.memory.characters.get('Aragorn');
    expect(char.name).toBe('Aragorn');
    expect(char.description).toBe('A ranger from the North');
    expect(char.traits).toContain('brave');
    expect(char.status).toBe('active');
  });

  test('should add and retrieve locations', () => {
    memory.addLocation('Rivendell', {
      description: 'An elven sanctuary',
      significance: 'Council location'
    });

    const loc = memory.memory.locations.get('Rivendell');
    expect(loc.name).toBe('Rivendell');
    expect(loc.description).toBe('An elven sanctuary');
  });

  test('should add and retrieve items', () => {
    memory.addItem('Ring', {
      description: 'A powerful artifact',
      owner: 'Frodo',
      properties: ['magical', 'cursed']
    });

    const item = memory.memory.items.get('Ring');
    expect(item.name).toBe('Ring');
    expect(item.owner).toBe('Frodo');
    expect(item.properties).toContain('magical');
  });

  test('should record events', () => {
    memory.addEvent({
      description: 'The fellowship is formed',
      type: 'plot',
      significance: 'major',
      participants: ['Frodo', 'Aragorn', 'Gandalf']
    });

    expect(memory.memory.events.length).toBe(1);
    expect(memory.memory.events[0].description).toBe('The fellowship is formed');
    expect(memory.memory.events[0].participants).toContain('Frodo');
  });

  test('should record choices', () => {
    memory.addChoice(1, 'Take the mountain pass', 15);
    
    expect(memory.memory.choices.length).toBe(1);
    expect(memory.memory.choices[0].chapter).toBe(1);
    expect(memory.memory.choices[0].choice).toBe('Take the mountain pass');
    expect(memory.memory.choices[0].votes).toBe(15);
  });

  test('should generate context string', () => {
    memory.initialize('fantasy', 'Epic quest');
    memory.addCharacter('Hero', { description: 'Brave warrior' });
    memory.addLocation('Castle', { description: 'Dark fortress' });
    memory.addItem('Sword', { description: 'Legendary blade' });
    memory.addEvent({ description: 'Battle begins' });

    const context = memory.getContext();
    
    expect(context).toContain('fantasy');
    expect(context).toContain('Hero');
    expect(context).toContain('Castle');
    expect(context).toContain('Sword');
    expect(context).toContain('Battle begins');
  });

  test('should extract tags from text', () => {
    const text = `Aragorn entered the grand city of Minas Tirith with his sword "Anduril" drawn.`;
    const tags = memory.extractTags(text);

    expect(tags.characters).toContain('Aragorn');
    expect(tags.locations).toContain('Minas Tirith');
    expect(tags.items).toContain('Anduril');
  });

  test('should update memory from chapter', () => {
    const chapterText = `Gandalf the wizard arrived at the Shire carrying a mysterious staff.`;
    memory.updateFromChapter(chapterText);

    expect(memory.memory.characters.has('Gandalf')).toBe(true);
    expect(memory.memory.locations.has('Shire')).toBe(true);
    expect(memory.memory.events.length).toBeGreaterThan(0);
  });

  test('should increment chapter counter', () => {
    expect(memory.memory.currentChapter).toBe(0);
    memory.nextChapter();
    expect(memory.memory.currentChapter).toBe(1);
    memory.nextChapter();
    expect(memory.memory.currentChapter).toBe(2);
  });

  test('should get full memory state', () => {
    memory.addCharacter('Test', { description: 'Test character' });
    memory.addLocation('Test Place', { description: 'Test location' });
    
    const fullMemory = memory.getFullMemory();
    
    expect(Array.isArray(fullMemory.characters)).toBe(true);
    expect(Array.isArray(fullMemory.locations)).toBe(true);
    expect(fullMemory.characters.length).toBe(1);
    expect(fullMemory.locations.length).toBe(1);
  });

  test('should load memory from saved state', () => {
    const savedState = {
      theme: 'scifi',
      outline: 'Space adventure',
      characters: [{ name: 'Captain', description: 'Ship commander', traits: [], relationships: {}, status: 'active' }],
      locations: [{ name: 'Spaceship', description: 'USS Enterprise', significance: '', visited: [0] }],
      items: [{ name: 'Phaser', description: 'Energy weapon', properties: [], status: 'available' }],
      events: [],
      choices: [],
      currentChapter: 5,
      metadata: {}
    };

    memory.loadMemory(savedState);

    expect(memory.memory.theme).toBe('scifi');
    expect(memory.memory.currentChapter).toBe(5);
    expect(memory.memory.characters.size).toBe(1);
    expect(memory.memory.characters.get('Captain').description).toBe('Ship commander');
  });

  test('should reset memory', () => {
    memory.initialize('fantasy', 'Test');
    memory.addCharacter('Test', { description: 'Test' });
    memory.nextChapter();

    memory.reset();

    expect(memory.memory.theme).toBe(null);
    expect(memory.memory.characters.size).toBe(0);
    expect(memory.memory.currentChapter).toBe(0);
  });
});
