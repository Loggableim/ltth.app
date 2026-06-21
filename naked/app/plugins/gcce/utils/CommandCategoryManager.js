/**
 * Command Categorization System
 * V3: Organizes commands into categories with metadata
 */

class CommandCategoryManager {
  constructor() {
    // Map<categoryId, CategoryDefinition>
    this.categories = new Map();
    
    // Map<commandName, categoryId>
    this.commandCategories = new Map();
    
    // Default categories
    this.initDefaultCategories();
  }

  /**
   * Initialize default categories
   */
  initDefaultCategories() {
    const defaultCategories = [
      {
        id: 'system',
        name: 'System',
        description: 'System and administrative commands',
        icon: '⚙️',
        color: '#3498db',
        priority: 100
      },
      {
        id: 'moderation',
        name: 'Moderation',
        description: 'Moderation and management commands',
        icon: '🛡️',
        color: '#e74c3c',
        priority: 90
      },
      {
        id: 'entertainment',
        name: 'Entertainment',
        description: 'Fun and interactive commands',
        icon: '🎮',
        color: '#9b59b6',
        priority: 50
      },
      {
        id: 'information',
        name: 'Information',
        description: 'Informational and utility commands',
        icon: 'ℹ️',
        color: '#1abc9c',
        priority: 60
      },
      {
        id: 'social',
        name: 'Social',
        description: 'Social interaction commands',
        icon: '👥',
        color: '#f39c12',
        priority: 40
      },
      {
        id: 'stream',
        name: 'Stream',
        description: 'Stream control commands',
        icon: '📹',
        color: '#e67e22',
        priority: 80
      },
      {
        id: 'custom',
        name: 'Custom',
        description: 'Custom user commands',
        icon: '🔧',
        color: '#95a5a6',
        priority: 30
      },
      {
        id: 'general',
        name: 'General',
        description: 'General purpose commands',
        icon: '📝',
        color: '#34495e',
        priority: 20
      }
    ];

    for (const category of defaultCategories) {
      this.createCategory(category);
    }
  }

  /**
   * Create a category
   * @param {Object} categoryDef - Category definition
   * @returns {boolean} Success status
   */
  createCategory(categoryDef) {
    try {
      const category = {
        id: categoryDef.id.toLowerCase(),
        name: categoryDef.name,
        description: categoryDef.description || '',
        icon: categoryDef.icon || '📁',
        color: categoryDef.color || '#000000',
        priority: categoryDef.priority || 0,
        metadata: categoryDef.metadata || {},
        createdAt: Date.now()
      };

      this.categories.set(category.id, category);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Assign command to category
   * @param {string} commandName - Command name
   * @param {string} categoryId - Category ID
   * @returns {boolean} Success status
   */
  assignCommandToCategory(commandName, categoryId) {
    categoryId = categoryId.toLowerCase();
    
    if (!this.categories.has(categoryId)) {
      return false;
    }

    this.commandCategories.set(commandName.toLowerCase(), categoryId);
    return true;
  }

  /**
   * Get category for command
   * @param {string} commandName - Command name
   * @returns {Object|null} Category or null
   */
  getCommandCategory(commandName) {
    const categoryId = this.commandCategories.get(commandName.toLowerCase());
    if (!categoryId) {
      return this.categories.get('general');
    }
    return this.categories.get(categoryId);
  }

  /**
   * Get all categories
   * @param {boolean} sorted - Sort by priority
   * @returns {Array} Array of categories
   */
  getAllCategories(sorted = true) {
    let categories = Array.from(this.categories.values());
    
    if (sorted) {
      categories.sort((a, b) => b.priority - a.priority);
    }

    return categories;
  }

  /**
   * Get category by ID
   * @param {string} categoryId - Category ID
   * @returns {Object|null} Category or null
   */
  getCategory(categoryId) {
    return this.categories.get(categoryId.toLowerCase()) || null;
  }

  /**
   * Get commands by category
   * @param {string} categoryId - Category ID
   * @param {Array} allCommands - All commands to filter
   * @returns {Array} Commands in category
   */
  getCommandsByCategory(categoryId, allCommands) {
    const commandsInCategory = [];
    
    for (const command of allCommands) {
      const commandCategoryId = this.commandCategories.get(command.name);
      if (commandCategoryId === categoryId || (!commandCategoryId && categoryId === 'general')) {
        commandsInCategory.push(command);
      }
    }

    return commandsInCategory;
  }

  /**
   * Group commands by category
   * @param {Array} allCommands - All commands
   * @returns {Object} Commands grouped by category
   */
  groupCommandsByCategory(allCommands) {
    const grouped = {};

    // Initialize all categories
    for (const category of this.categories.values()) {
      grouped[category.id] = {
        category: category,
        commands: []
      };
    }

    // Assign commands to categories
    for (const command of allCommands) {
      const categoryId = this.commandCategories.get(command.name) || 'general';
      if (grouped[categoryId]) {
        grouped[categoryId].commands.push(command);
      }
    }

    return grouped;
  }

  /**
   * Update category
   * @param {string} categoryId - Category ID
   * @param {Object} updates - Category updates
   * @returns {boolean} Success status
   */
  updateCategory(categoryId, updates) {
    const category = this.categories.get(categoryId.toLowerCase());
    if (!category) return false;

    Object.assign(category, updates);
    return true;
  }

  /**
   * Delete category
   * @param {string} categoryId - Category ID
   * @returns {boolean} Success status
   */
  deleteCategory(categoryId) {
    categoryId = categoryId.toLowerCase();
    
    // Can't delete default categories
    const defaultCategories = ['system', 'general', 'custom'];
    if (defaultCategories.includes(categoryId)) {
      return false;
    }

    // Reassign commands to 'general'
    for (const [commandName, catId] of this.commandCategories.entries()) {
      if (catId === categoryId) {
        this.commandCategories.set(commandName, 'general');
      }
    }

    return this.categories.delete(categoryId);
  }

  /**
   * Get statistics
   * @returns {Object} Category stats
   */
  getStats() {
    return {
      totalCategories: this.categories.size,
      categorizedCommands: this.commandCategories.size
    };
  }

  /**
   * Clear all custom categories
   */
  clear() {
    this.categories.clear();
    this.commandCategories.clear();
    this.initDefaultCategories();
  }
}

module.exports = CommandCategoryManager;
