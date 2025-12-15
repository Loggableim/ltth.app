/**
 * Command Parameter Type System
 * F4: Advanced parameter validation with type checking
 */

class CommandParameterTypes {
  constructor() {
    // Built-in type validators
    this.types = {
      string: {
        name: 'string',
        validate: (value) => typeof value === 'string',
        parse: (value) => String(value),
        description: 'Any text value'
      },
      
      number: {
        name: 'number',
        validate: (value) => !isNaN(parseFloat(value)),
        parse: (value) => parseFloat(value),
        description: 'Numeric value'
      },
      
      integer: {
        name: 'integer',
        validate: (value) => Number.isInteger(parseFloat(value)),
        parse: (value) => parseInt(value, 10),
        description: 'Whole number'
      },
      
      boolean: {
        name: 'boolean',
        validate: (value) => ['true', 'false', '1', '0', 'yes', 'no'].includes(value.toLowerCase()),
        parse: (value) => ['true', '1', 'yes'].includes(value.toLowerCase()),
        description: 'True or false'
      },
      
      username: {
        name: 'username',
        validate: (value) => /^[a-zA-Z0-9_]{3,20}$/.test(value),
        parse: (value) => value.trim(),
        description: 'Valid username (3-20 alphanumeric characters)'
      },
      
      url: {
        name: 'url',
        validate: (value) => {
          try {
            new URL(value);
            return true;
          } catch {
            return false;
          }
        },
        parse: (value) => value.trim(),
        description: 'Valid URL'
      },
      
      email: {
        name: 'email',
        validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        parse: (value) => value.toLowerCase().trim(),
        description: 'Valid email address'
      },
      
      choice: {
        name: 'choice',
        validate: (value, options) => options.includes(value.toLowerCase()),
        parse: (value) => value.toLowerCase(),
        description: 'One of predefined choices'
      },
      
      range: {
        name: 'range',
        validate: (value, min, max) => {
          const num = parseFloat(value);
          return !isNaN(num) && num >= min && num <= max;
        },
        parse: (value) => parseFloat(value),
        description: 'Number within range'
      },
      
      json: {
        name: 'json',
        validate: (value) => {
          try {
            JSON.parse(value);
            return true;
          } catch {
            return false;
          }
        },
        parse: (value) => JSON.parse(value),
        description: 'Valid JSON string'
      },
      
      array: {
        name: 'array',
        validate: (value) => Array.isArray(value) || typeof value === 'string',
        parse: (value) => {
          if (Array.isArray(value)) return value;
          return value.split(',').map(v => v.trim());
        },
        description: 'Comma-separated values'
      }
    };
  }

  /**
   * Register custom type
   * @param {Object} typeDef - Type definition
   */
  registerType(typeDef) {
    this.types[typeDef.name] = {
      name: typeDef.name,
      validate: typeDef.validate,
      parse: typeDef.parse || (v => v),
      description: typeDef.description || ''
    };
  }

  /**
   * Validate and parse command parameters
   * @param {Array} args - Raw arguments
   * @param {Array} paramDefs - Parameter definitions
   * @returns {Object} Validation result
   */
  validateAndParse(args, paramDefs) {
    const parsed = {};
    const errors = [];

    for (let i = 0; i < paramDefs.length; i++) {
      const paramDef = paramDefs[i];
      const rawValue = args[i];

      // Check required
      if (paramDef.required && rawValue === undefined) {
        errors.push(`Missing required parameter: ${paramDef.name}`);
        continue;
      }

      // Skip if optional and not provided
      if (!paramDef.required && rawValue === undefined) {
        if (paramDef.default !== undefined) {
          parsed[paramDef.name] = paramDef.default;
        }
        continue;
      }

      // Get type validator
      const typeValidator = this.types[paramDef.type];
      if (!typeValidator) {
        errors.push(`Unknown parameter type: ${paramDef.type}`);
        continue;
      }

      // Validate
      const isValid = typeValidator.validate(
        rawValue,
        ...( paramDef.options || [])
      );

      if (!isValid) {
        errors.push(
          `Invalid value for ${paramDef.name}: expected ${typeValidator.description}`
        );
        continue;
      }

      // Parse
      try {
        parsed[paramDef.name] = typeValidator.parse(
          rawValue,
          ...(paramDef.options || [])
        );
      } catch (error) {
        errors.push(`Error parsing ${paramDef.name}: ${error.message}`);
      }

      // Custom validation
      if (paramDef.validate) {
        const customValidation = paramDef.validate(parsed[paramDef.name]);
        if (!customValidation.valid) {
          errors.push(customValidation.error || `Invalid ${paramDef.name}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      parsed
    };
  }

  /**
   * Generate parameter help text
   * @param {Array} paramDefs - Parameter definitions
   * @returns {string} Help text
   */
  generateHelp(paramDefs) {
    const lines = [];
    
    for (const param of paramDefs) {
      const required = param.required ? 'required' : 'optional';
      const type = this.types[param.type];
      const description = param.description || type.description;
      
      lines.push(`  ${param.name} (${type.name}, ${required}): ${description}`);
      
      if (param.default !== undefined) {
        lines.push(`    Default: ${param.default}`);
      }
      
      if (param.options) {
        lines.push(`    Options: ${param.options.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get type definition
   * @param {string} typeName - Type name
   * @returns {Object|null} Type definition
   */
  getType(typeName) {
    return this.types[typeName] || null;
  }

  /**
   * Get all types
   * @returns {Array} Array of type definitions
   */
  getAllTypes() {
    return Object.values(this.types);
  }
}

module.exports = CommandParameterTypes;
