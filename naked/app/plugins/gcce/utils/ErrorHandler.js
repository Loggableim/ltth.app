/**
 * Enhanced Error Handling System
 * Provides structured errors with i18n support and helpful suggestions
 */

class ErrorHandler {
  constructor() {
    this.errorCodes = {
      // Command errors
      COMMAND_NOT_FOUND: 'COMMAND_NOT_FOUND',
      COMMAND_DISABLED: 'COMMAND_DISABLED',
      COMMAND_ON_COOLDOWN: 'COMMAND_ON_COOLDOWN',
      
      // Permission errors
      PERMISSION_DENIED: 'PERMISSION_DENIED',
      
      // Validation errors
      MISSING_ARGUMENTS: 'MISSING_ARGUMENTS',
      TOO_MANY_ARGUMENTS: 'TOO_MANY_ARGUMENTS',
      INVALID_ARGUMENT_TYPE: 'INVALID_ARGUMENT_TYPE',
      INVALID_ARGUMENT_VALUE: 'INVALID_ARGUMENT_VALUE',
      
      // Rate limiting errors
      RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
      RATE_LIMIT_USER: 'RATE_LIMIT_USER',
      RATE_LIMIT_GLOBAL: 'RATE_LIMIT_GLOBAL',
      
      // Execution errors
      EXECUTION_FAILED: 'EXECUTION_FAILED',
      TIMEOUT: 'TIMEOUT',
      
      // System errors
      PLUGIN_NOT_LOADED: 'PLUGIN_NOT_LOADED',
      INTERNAL_ERROR: 'INTERNAL_ERROR'
    };

    // Error messages in different languages
    this.messages = {
      en: {
        COMMAND_NOT_FOUND: 'Command "{command}" not found. Type /help for available commands.',
        COMMAND_DISABLED: 'Command "{command}" is currently disabled.',
        COMMAND_ON_COOLDOWN: 'Command "{command}" is on cooldown. Please wait {remaining} seconds.',
        PERMISSION_DENIED: 'You do not have permission to use "{command}". Required: {required}',
        MISSING_ARGUMENTS: 'Missing required arguments for "{command}". Syntax: {syntax}',
        TOO_MANY_ARGUMENTS: 'Too many arguments for "{command}". Syntax: {syntax}',
        INVALID_ARGUMENT_TYPE: 'Invalid argument type for "{command}". Expected {expected}, got {actual}.',
        INVALID_ARGUMENT_VALUE: 'Invalid argument value for "{command}": {value}',
        RATE_LIMIT_EXCEEDED: 'You are sending commands too quickly. Please wait {remaining} seconds.',
        RATE_LIMIT_USER: 'User rate limit exceeded. Please wait {remaining} seconds.',
        RATE_LIMIT_GLOBAL: 'Global rate limit exceeded. Please try again in {remaining} seconds.',
        EXECUTION_FAILED: 'Command "{command}" failed: {error}',
        TIMEOUT: 'Command "{command}" timed out after {timeout}ms.',
        PLUGIN_NOT_LOADED: 'Plugin "{plugin}" is not currently loaded.',
        INTERNAL_ERROR: 'An internal error occurred. Please try again later.'
      },
      de: {
        COMMAND_NOT_FOUND: 'Befehl "{command}" nicht gefunden. Tippe /help für verfügbare Befehle.',
        COMMAND_DISABLED: 'Befehl "{command}" ist derzeit deaktiviert.',
        COMMAND_ON_COOLDOWN: 'Befehl "{command}" hat Abklingzeit. Bitte warte {remaining} Sekunden.',
        PERMISSION_DENIED: 'Du hast keine Berechtigung für "{command}". Benötigt: {required}',
        MISSING_ARGUMENTS: 'Fehlende Argumente für "{command}". Syntax: {syntax}',
        TOO_MANY_ARGUMENTS: 'Zu viele Argumente für "{command}". Syntax: {syntax}',
        INVALID_ARGUMENT_TYPE: 'Ungültiger Argumenttyp für "{command}". Erwartet {expected}, erhalten {actual}.',
        INVALID_ARGUMENT_VALUE: 'Ungültiger Argumentwert für "{command}": {value}',
        RATE_LIMIT_EXCEEDED: 'Du sendest Befehle zu schnell. Bitte warte {remaining} Sekunden.',
        RATE_LIMIT_USER: 'Benutzer-Limit überschritten. Bitte warte {remaining} Sekunden.',
        RATE_LIMIT_GLOBAL: 'Globales Limit überschritten. Bitte versuche es in {remaining} Sekunden erneut.',
        EXECUTION_FAILED: 'Befehl "{command}" fehlgeschlagen: {error}',
        TIMEOUT: 'Befehl "{command}" Timeout nach {timeout}ms.',
        PLUGIN_NOT_LOADED: 'Plugin "{plugin}" ist derzeit nicht geladen.',
        INTERNAL_ERROR: 'Ein interner Fehler ist aufgetreten. Bitte versuche es später erneut.'
      }
    };

    this.defaultLanguage = 'en';
  }

  /**
   * Create an error object
   * @param {string} code - Error code
   * @param {Object} params - Error parameters for template replacement
   * @param {string} language - Language code (default: en)
   * @returns {Object} Error object
   */
  createError(code, params = {}, language = this.defaultLanguage) {
    const template = this.messages[language]?.[code] || this.messages.en[code] || code;
    const message = this.replaceTemplateParams(template, params);

    return {
      code,
      message,
      params,
      suggestion: this.getSuggestion(code, params),
      timestamp: Date.now()
    };
  }

  /**
   * Replace template parameters in message
   * @param {string} template - Message template
   * @param {Object} params - Parameters
   * @returns {string} Formatted message
   */
  replaceTemplateParams(template, params) {
    let message = template;
    
    for (const [key, value] of Object.entries(params)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    
    return message;
  }

  /**
   * Get helpful suggestion for error
   * @param {string} code - Error code
   * @param {Object} params - Error parameters
   * @returns {string|null} Suggestion or null
   */
  getSuggestion(code, params) {
    const suggestions = {
      COMMAND_NOT_FOUND: params.command 
        ? `Try /help to see all available commands. Did you mean /${params.similar}?`
        : 'Type /help to see all available commands.',
      MISSING_ARGUMENTS: params.command 
        ? `Use /help ${params.command} for correct usage.`
        : null,
      TOO_MANY_ARGUMENTS: params.command 
        ? `Use /help ${params.command} for correct usage.`
        : null,
      PERMISSION_DENIED: 'This command requires elevated permissions.',
      COMMAND_ON_COOLDOWN: 'Commands have cooldowns to prevent spam.',
      RATE_LIMIT_EXCEEDED: 'Slow down to avoid being rate limited.'
    };

    return suggestions[code] || null;
  }

  /**
   * Format remaining time for display
   * @param {number} ms - Milliseconds
   * @returns {string} Formatted time
   */
  formatRemainingTime(ms) {
    const seconds = Math.ceil(ms / 1000);
    
    if (seconds < 60) {
      return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }
    
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * Set default language
   * @param {string} language - Language code
   */
  setDefaultLanguage(language) {
    if (this.messages[language]) {
      this.defaultLanguage = language;
    }
  }

  /**
   * Add custom error messages
   * @param {string} language - Language code
   * @param {Object} messages - Custom messages
   */
  addMessages(language, messages) {
    if (!this.messages[language]) {
      this.messages[language] = {};
    }
    
    Object.assign(this.messages[language], messages);
  }

  /**
   * Get error code enum
   * @returns {Object} Error codes
   */
  getErrorCodes() {
    return { ...this.errorCodes };
  }
}

module.exports = ErrorHandler;
