/**
 * Command Template System
 * F6: Allows creating command templates with placeholders
 */

class CommandTemplateManager {
  constructor() {
    // Map<templateId, TemplateDefinition>
    this.templates = new Map();
    
    // Statistics
    this.stats = {
      totalTemplates: 0,
      totalUsages: 0
    };
  }

  /**
   * Create a command template
   * @param {Object} templateDef - Template definition
   * @returns {boolean} Success status
   */
  createTemplate(templateDef) {
    try {
      const template = {
        id: templateDef.id.toLowerCase(),
        name: templateDef.name,
        description: templateDef.description || '',
        pattern: templateDef.pattern, // Template string with {placeholders}
        placeholders: templateDef.placeholders || [], // Array of placeholder definitions
        defaults: templateDef.defaults || {}, // Default values for placeholders
        validators: templateDef.validators || {}, // Validation functions per placeholder
        example: templateDef.example || '',
        category: templateDef.category || 'general',
        createdAt: Date.now()
      };

      this.templates.set(template.id, template);
      this.stats.totalTemplates++;

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Apply template with values
   * @param {string} templateId - Template ID
   * @param {Object} values - Values for placeholders
   * @returns {Object} Result with command string
   */
  applyTemplate(templateId, values = {}) {
    const template = this.templates.get(templateId.toLowerCase());
    
    if (!template) {
      return {
        success: false,
        error: `Template '${templateId}' not found`
      };
    }

    // Merge defaults with provided values
    const allValues = { ...template.defaults, ...values };

    // Validate values
    const validation = this.validateValues(template, allValues);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    // Apply template
    let result = template.pattern;
    
    for (const [key, value] of Object.entries(allValues)) {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    }

    // Check for unfilled placeholders
    const unfilledMatch = result.match(/\{([^}]+)\}/);
    if (unfilledMatch) {
      return {
        success: false,
        error: `Missing value for placeholder: ${unfilledMatch[1]}`
      };
    }

    this.stats.totalUsages++;

    return {
      success: true,
      command: result,
      template: template.id,
      values: allValues
    };
  }

  /**
   * Validate placeholder values
   * @param {Object} template - Template object
   * @param {Object} values - Values to validate
   * @returns {Object} Validation result
   */
  validateValues(template, values) {
    // Check required placeholders
    for (const placeholder of template.placeholders) {
      const key = placeholder.name || placeholder;
      const required = placeholder.required !== undefined ? placeholder.required : true;

      if (required && !values[key]) {
        return {
          valid: false,
          error: `Missing required placeholder: ${key}`
        };
      }

      // Run custom validator if exists
      if (values[key] && template.validators[key]) {
        try {
          const isValid = template.validators[key](values[key]);
          if (!isValid) {
            return {
              valid: false,
              error: `Invalid value for ${key}: ${values[key]}`
            };
          }
        } catch (error) {
          return {
            valid: false,
            error: `Validation error for ${key}: ${error.message}`
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Get template by ID
   * @param {string} templateId - Template ID
   * @returns {Object|null} Template or null
   */
  getTemplate(templateId) {
    return this.templates.get(templateId.toLowerCase()) || null;
  }

  /**
   * Get all templates
   * @param {string} category - Filter by category (optional)
   * @returns {Array} Array of templates
   */
  getAllTemplates(category = null) {
    let templates = Array.from(this.templates.values());
    
    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    return templates;
  }

  /**
   * Delete template
   * @param {string} templateId - Template ID
   * @returns {boolean} True if deleted
   */
  deleteTemplate(templateId) {
    const result = this.templates.delete(templateId.toLowerCase());
    if (result) {
      this.stats.totalTemplates--;
    }
    return result;
  }

  /**
   * Get template categories
   * @returns {Array} Array of categories
   */
  getCategories() {
    const categories = new Set();
    for (const template of this.templates.values()) {
      categories.add(template.category);
    }
    return Array.from(categories);
  }

  /**
   * Get statistics
   * @returns {Object} Template stats
   */
  getStats() {
    return {
      ...this.stats,
      currentTemplates: this.templates.size
    };
  }

  /**
   * Clear all templates
   */
  clear() {
    this.templates.clear();
    this.stats = {
      totalTemplates: 0,
      totalUsages: 0
    };
  }
}

module.exports = CommandTemplateManager;
