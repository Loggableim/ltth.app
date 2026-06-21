/**
 * Story Memory System
 * Tracks characters, locations, items, and events for story coherence
 */
class StoryMemory {
  constructor(logger) {
    this.logger = logger;
    this.reset();
  }

  /**
   * Reset memory to initial state
   */
  reset() {
    this.memory = {
      theme: null,
      outline: null,
      characters: new Map(), // name -> {description, traits, relationships}
      locations: new Map(),  // name -> {description, significance}
      items: new Map(),      // name -> {description, owner, properties}
      events: [],            // chronological list of important events
      choices: [],           // history of choices made
      currentChapter: 0,
      metadata: {
        startTime: new Date().toISOString(),
        genre: null,
        tone: null
      }
    };
  }

  /**
   * Initialize story with theme and outline
   * @param {string} theme - Story theme (fantasy, cyberpunk, etc.)
   * @param {string} outline - Story outline
   * @param {Object} metadata - Additional metadata
   */
  initialize(theme, outline, metadata = {}) {
    this.memory.theme = theme;
    this.memory.outline = outline;
    this.memory.metadata = { ...this.memory.metadata, ...metadata };
    this.logger.info(`Story Memory initialized: Theme=${theme}`);
  }

  /**
   * Add or update a character
   * @param {string} name - Character name
   * @param {Object} data - Character data
   */
  addCharacter(name, data) {
    this.memory.characters.set(name, {
      name,
      description: data.description || '',
      traits: data.traits || [],
      relationships: data.relationships || {},
      introduced: data.introduced || this.memory.currentChapter,
      status: data.status || 'active'
    });
    this.logger.debug(`Character added: ${name}`);
  }

  /**
   * Add or update a location
   * @param {string} name - Location name
   * @param {Object} data - Location data
   */
  addLocation(name, data) {
    this.memory.locations.set(name, {
      name,
      description: data.description || '',
      significance: data.significance || '',
      introduced: data.introduced || this.memory.currentChapter,
      visited: data.visited || [this.memory.currentChapter]
    });
    this.logger.debug(`Location added: ${name}`);
  }

  /**
   * Add or update an item
   * @param {string} name - Item name
   * @param {Object} data - Item data
   */
  addItem(name, data) {
    this.memory.items.set(name, {
      name,
      description: data.description || '',
      owner: data.owner || null,
      properties: data.properties || [],
      introduced: data.introduced || this.memory.currentChapter,
      status: data.status || 'available'
    });
    this.logger.debug(`Item added: ${name}`);
  }

  /**
   * Record an important event
   * @param {Object} event - Event data
   */
  addEvent(event) {
    this.memory.events.push({
      chapter: this.memory.currentChapter,
      timestamp: new Date().toISOString(),
      description: event.description,
      type: event.type || 'plot',
      significance: event.significance || 'normal',
      participants: event.participants || []
    });
    this.logger.debug(`Event recorded: ${event.description.substring(0, 50)}...`);
  }

  /**
   * Record a choice made by viewers
   * @param {number} chapterNumber - Chapter number
   * @param {string} choiceText - The choice that was made
   * @param {number} voteCount - Number of votes
   */
  addChoice(chapterNumber, choiceText, voteCount) {
    this.memory.choices.push({
      chapter: chapterNumber,
      choice: choiceText,
      votes: voteCount,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get story context for LLM prompt
   * @param {number} recentEvents - Number of recent events to include
   * @returns {string} - Formatted context
   */
  getContext(recentEvents = 5) {
    const context = [];
    
    context.push(`Theme: ${this.memory.theme}`);
    context.push(`Current Chapter: ${this.memory.currentChapter}`);
    
    if (this.memory.characters.size > 0) {
      context.push('\nCharacters:');
      for (const [name, char] of this.memory.characters) {
        if (char.status === 'active') {
          context.push(`- ${name}: ${char.description}`);
        }
      }
    }
    
    if (this.memory.locations.size > 0) {
      context.push('\nLocations:');
      for (const [name, loc] of this.memory.locations) {
        context.push(`- ${name}: ${loc.description}`);
      }
    }
    
    if (this.memory.items.size > 0) {
      context.push('\nImportant Items:');
      for (const [name, item] of this.memory.items) {
        if (item.status === 'available') {
          context.push(`- ${name}: ${item.description}`);
        }
      }
    }
    
    if (this.memory.events.length > 0) {
      context.push('\nRecent Events:');
      const recent = this.memory.events.slice(-recentEvents);
      for (const event of recent) {
        context.push(`- Chapter ${event.chapter}: ${event.description}`);
      }
    }
    
    if (this.memory.choices.length > 0) {
      context.push('\nPrevious Choices:');
      const recentChoices = this.memory.choices.slice(-3);
      for (const choice of recentChoices) {
        context.push(`- Chapter ${choice.chapter}: ${choice.choice}`);
      }
    }
    
    return context.join('\n');
  }

  /**
   * Extract memory tags from chapter text
   * Uses simple pattern matching - could be enhanced with NLP
   * @param {string} chapterText - Chapter content
   * @returns {Object} - Extracted tags
   */
  extractTags(chapterText) {
    const tags = {
      characters: [],
      locations: [],
      items: []
    };

    // Extract potential character names (capitalized words)
    const capitalizedWords = chapterText.match(/\b[A-Z][a-z]+\b/g) || [];
    tags.characters = [...new Set(capitalizedWords)].slice(0, 5);

    // Extract potential locations (capitalized phrases after location prepositions)
    const locationPatterns = /(?:in|at|to|near|from|of)\s+(?:the\s+)?((?:[A-Z][a-z]+(?:\s+|$)){1,4})/g;
    let match;
    while ((match = locationPatterns.exec(chapterText)) !== null) {
      tags.locations.push(match[1].trim());
    }
    tags.locations = [...new Set(tags.locations)].slice(0, 3);

    // Extract potential items (quoted words or specific patterns)
    const itemPatterns = /"([^"]+)"|(?:found|grabbed|picked up|wielded|used|carrying|holding)\s+(?:a|an|the)?\s*([a-z\s]+)/gi;
    while ((match = itemPatterns.exec(chapterText)) !== null) {
      const item = match[1] || match[2];
      if (item && item.length < 30) {
        tags.items.push(item.trim());
      }
    }
    tags.items = [...new Set(tags.items)].slice(0, 3);

    return tags;
  }

  /**
   * Auto-update memory from chapter
   * @param {string} chapterText - Chapter content
   * @param {Object} explicit - Explicitly defined memory updates
   */
  updateFromChapter(chapterText, explicit = {}) {
    // Auto-extract if no explicit tags provided
    const tags = explicit.tags || this.extractTags(chapterText);

    // Add discovered characters
    if (tags.characters) {
      for (const name of tags.characters) {
        if (!this.memory.characters.has(name)) {
          this.addCharacter(name, { 
            description: `Character introduced in chapter ${this.memory.currentChapter}`,
            traits: []
          });
        }
      }
    }

    // Add discovered locations
    if (tags.locations) {
      for (const name of tags.locations) {
        if (!this.memory.locations.has(name)) {
          this.addLocation(name, {
            description: `Location discovered in chapter ${this.memory.currentChapter}`
          });
        }
      }
    }

    // Add discovered items
    if (tags.items) {
      for (const name of tags.items) {
        if (!this.memory.items.has(name)) {
          this.addItem(name, {
            description: `Item found in chapter ${this.memory.currentChapter}`
          });
        }
      }
    }

    // Add chapter event
    this.addEvent({
      description: chapterText.substring(0, 200),
      type: 'chapter',
      significance: 'major'
    });
  }

  /**
   * Increment chapter counter
   */
  nextChapter() {
    this.memory.currentChapter++;
    this.logger.info(`Story Memory: Advanced to chapter ${this.memory.currentChapter}`);
  }

  /**
   * Get complete memory state
   * @returns {Object} - Full memory object
   */
  getFullMemory() {
    return {
      ...this.memory,
      characters: Array.from(this.memory.characters.values()),
      locations: Array.from(this.memory.locations.values()),
      items: Array.from(this.memory.items.values())
    };
  }

  /**
   * Load memory from saved state
   * @param {Object} savedMemory - Previously saved memory
   */
  loadMemory(savedMemory) {
    this.memory = {
      ...savedMemory,
      characters: new Map(savedMemory.characters.map(c => [c.name, c])),
      locations: new Map(savedMemory.locations.map(l => [l.name, l])),
      items: new Map(savedMemory.items.map(i => [i.name, i]))
    };
    this.logger.info('Story Memory loaded from saved state');
  }
}

module.exports = StoryMemory;
