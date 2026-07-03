/**
 * Input Validation Utilities
 * Provides standardized validation functions for API inputs
 */

class ValidationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.statusCode = 400;
    }
}

class Validators {
    /**
     * Validate string with optional constraints
     * @param {string} value - Value to validate
     * @param {Object} options - Validation options
     * @param {number} options.minLength - Minimum length
     * @param {number} options.maxLength - Maximum length (default: 10000)
     * @param {RegExp} options.pattern - Pattern to match
     * @param {boolean} options.required - Whether value is required
     * @param {string} options.fieldName - Field name for error messages
     * @returns {string} - Validated value
     */
    static string(value, options = {}) {
        const {
            minLength = 0,
            maxLength = 10000,
            pattern = null,
            required = false,
            fieldName = 'value'
        } = options;

        // Check required
        if (required && (value === undefined || value === null || value === '')) {
            throw new ValidationError(`${fieldName} is required`, fieldName);
        }

        // Allow empty if not required
        if (!required && (value === undefined || value === null || value === '')) {
            return value;
        }

        // Type check
        if (typeof value !== 'string') {
            throw new ValidationError(`${fieldName} must be a string`, fieldName);
        }

        // Length validation
        if (value.length < minLength) {
            throw new ValidationError(`${fieldName} must be at least ${minLength} characters`, fieldName);
        }

        if (value.length > maxLength) {
            throw new ValidationError(`${fieldName} must be at most ${maxLength} characters`, fieldName);
        }

        // Pattern validation
        if (pattern && !pattern.test(value)) {
            throw new ValidationError(`${fieldName} has invalid format`, fieldName);
        }

        return value;
    }

    /**
     * Validate number with optional constraints
     * @param {number} value - Value to validate
     * @param {Object} options - Validation options
     * @param {number} options.min - Minimum value
     * @param {number} options.max - Maximum value
     * @param {boolean} options.integer - Must be integer
     * @param {boolean} options.required - Whether value is required
     * @param {string} options.fieldName - Field name for error messages
     * @returns {number} - Validated value
     */
    static number(value, options = {}) {
        const {
            min = -Infinity,
            max = Infinity,
            integer = false,
            required = false,
            fieldName = 'value'
        } = options;

        // Check required
        if (required && (value === undefined || value === null)) {
            throw new ValidationError(`${fieldName} is required`, fieldName);
        }

        // Allow empty if not required
        if (!required && (value === undefined || value === null)) {
            return value;
        }

        // Type check and coerce
        const num = Number(value);
        if (isNaN(num)) {
            throw new ValidationError(`${fieldName} must be a number`, fieldName);
        }

        // Integer check
        if (integer && !Number.isInteger(num)) {
            throw new ValidationError(`${fieldName} must be an integer`, fieldName);
        }

        // Range validation
        if (num < min) {
            throw new ValidationError(`${fieldName} must be at least ${min}`, fieldName);
        }

        if (num > max) {
            throw new ValidationError(`${fieldName} must be at most ${max}`, fieldName);
        }

        return num;
    }

    /**
     * Validate boolean
     * @param {boolean} value - Value to validate
     * @param {Object} options - Validation options
     * @param {boolean} options.required - Whether value is required
     * @param {string} options.fieldName - Field name for error messages
     * @returns {boolean} - Validated value
     */
    static boolean(value, options = {}) {
        const { required = false, fieldName = 'value' } = options;

        // Check required
        if (required && (value === undefined || value === null)) {
            throw new ValidationError(`${fieldName} is required`, fieldName);
        }

        // Allow empty if not required
        if (!required && (value === undefined || value === null)) {
            return value;
        }

        // Type check and coerce
        if (typeof value === 'boolean') {
            return value;
        }

        if (value === 'true' || value === '1' || value === 1) {
            return true;
        }

        if (value === 'false' || value === '0' || value === 0) {
            return false;
        }

        throw new ValidationError(`${fieldName} must be a boolean`, fieldName);
    }

    /**
     * Validate array with optional constraints
     * @param {Array} value - Value to validate
     * @param {Object} options - Validation options
     * @param {number} options.minLength - Minimum length
     * @param {number} options.maxLength - Maximum length (default: 1000)
     * @param {Function} options.itemValidator - Validator function for each item
     * @param {boolean} options.required - Whether value is required
     * @param {string} options.fieldName - Field name for error messages
     * @returns {Array} - Validated value
     */
    static array(value, options = {}) {
        const {
            minLength = 0,
            maxLength = 1000,
            itemValidator = null,
            required = false,
            fieldName = 'value'
        } = options;

        // Check required
        if (required && (value === undefined || value === null)) {
            throw new ValidationError(`${fieldName} is required`, fieldName);
        }

        // Allow empty if not required
        if (!required && (value === undefined || value === null)) {
            return value;
        }

        // Type check
        if (!Array.isArray(value)) {
            throw new ValidationError(`${fieldName} must be an array`, fieldName);
        }

        // Length validation
        if (value.length < minLength) {
            throw new ValidationError(`${fieldName} must have at least ${minLength} items`, fieldName);
        }

        if (value.length > maxLength) {
            throw new ValidationError(`${fieldName} must have at most ${maxLength} items`, fieldName);
        }

        // Item validation
        if (itemValidator) {
            value.forEach((item, index) => {
                try {
                    itemValidator(item);
                } catch (err) {
                    throw new ValidationError(`${fieldName}[${index}]: ${err.message}`, fieldName);
                }
            });
        }

        return value;
    }

    /**
     * Validate object with required fields
     * @param {Object} value - Value to validate
     * @param {Object} options - Validation options
     * @param {Array<string>} options.requiredFields - Required field names
     * @param {Object} options.fieldValidators - Map of field names to validator functions
     * @param {boolean} options.required - Whether value is required
     * @param {string} options.fieldName - Field name for error messages
     * @returns {Object} - Validated value
     */
    static object(value, options = {}) {
        const {
            requiredFields = [],
            fieldValidators = {},
            required = false,
            fieldName = 'value'
        } = options;

        // Check required
        if (required && (value === undefined || value === null)) {
            throw new ValidationError(`${fieldName} is required`, fieldName);
        }

        // Allow empty if not required
        if (!required && (value === undefined || value === null)) {
            return value;
        }

        // Type check
        if (typeof value !== 'object' || Array.isArray(value)) {
            throw new ValidationError(`${fieldName} must be an object`, fieldName);
        }

        // Required fields check
        for (const field of requiredFields) {
            if (!(field in value) || value[field] === undefined || value[field] === null) {
                throw new ValidationError(`${fieldName}.${field} is required`, `${fieldName}.${field}`);
            }
        }

        // Field validation
        for (const [field, validator] of Object.entries(fieldValidators)) {
            if (field in value && value[field] !== undefined && value[field] !== null) {
                try {
                    value[field] = validator(value[field]);
                } catch (err) {
                    throw new ValidationError(`${fieldName}.${field}: ${err.message}`, `${fieldName}.${field}`);
                }
            }
        }

        return value;
    }

    /**
     * Validate URL
     * @param {string} value - URL to validate
     * @param {Object} options - Validation options
     * @param {Array<string>} options.allowedProtocols - Allowed protocols (default: ['http:', 'https:'])
     * @param {boolean} options.required - Whether value is required
     * @param {string} options.fieldName - Field name for error messages
     * @returns {string} - Validated URL
     */
    static url(value, options = {}) {
        const {
            allowedProtocols = ['http:', 'https:'],
            required = false,
            fieldName = 'url'
        } = options;

        // Check required
        if (required && !value) {
            throw new ValidationError(`${fieldName} is required`, fieldName);
        }

        if (!value && !required) {
            return value;
        }

        // Type check
        if (typeof value !== 'string') {
            throw new ValidationError(`${fieldName} must be a string`, fieldName);
        }

        // URL validation
        let urlObj;
        try {
            urlObj = new URL(value);
        } catch (err) {
            throw new ValidationError(`${fieldName} is not a valid URL`, fieldName);
        }

        // Protocol validation
        if (!allowedProtocols.includes(urlObj.protocol)) {
            throw new ValidationError(`${fieldName} must use one of: ${allowedProtocols.join(', ')}`, fieldName);
        }

        return value;
    }

    /**
     * Validate email address
     * @param {string} value - Email to validate
     * @param {Object} options - Validation options
     * @param {boolean} options.required - Whether value is required
     * @param {string} options.fieldName - Field name for error messages
     * @returns {string} - Validated email
     */
    static email(value, options = {}) {
        const { required = false, fieldName = 'email' } = options;

        // Check required
        if (required && !value) {
            throw new ValidationError(`${fieldName} is required`, fieldName);
        }

        if (!value && !required) {
            return value;
        }

        // Type check
        if (typeof value !== 'string') {
            throw new ValidationError(`${fieldName} must be a string`, fieldName);
        }

        // Email pattern
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(value)) {
            throw new ValidationError(`${fieldName} is not a valid email address`, fieldName);
        }

        return value.toLowerCase();
    }

    /**
     * Validate enum value
     * @param {*} value - Value to validate
     * @param {Object} options - Validation options
     * @param {Array} options.allowedValues - Allowed values
     * @param {boolean} options.required - Whether value is required
     * @param {string} options.fieldName - Field name for error messages
     * @returns {*} - Validated value
     */
    static enum(value, options = {}) {
        const { allowedValues = [], required = false, fieldName = 'value' } = options;

        // Check required
        if (required && (value === undefined || value === null)) {
            throw new ValidationError(`${fieldName} is required`, fieldName);
        }

        if ((value === undefined || value === null) && !required) {
            return value;
        }

        // Enum validation
        if (!allowedValues.includes(value)) {
            throw new ValidationError(
                `${fieldName} must be one of: ${allowedValues.join(', ')}`,
                fieldName
            );
        }

        return value;
    }

    /**
     * Validate hex color code
     * @param {string} value - Color code to validate
     * @param {Object} options - Validation options
     * @param {boolean} options.required - Whether value is required
     * @param {string} options.fieldName - Field name for error messages
     * @returns {string} - Validated color code
     */
    static hexColor(value, options = {}) {
        const { required = false, fieldName = 'color' } = options;

        // Check required
        if (required && !value) {
            throw new ValidationError(`${fieldName} is required`, fieldName);
        }

        if (!value && !required) {
            return value;
        }

        // Type check
        if (typeof value !== 'string') {
            throw new ValidationError(`${fieldName} must be a string`, fieldName);
        }

        // Hex color pattern
        const hexPattern = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
        if (!hexPattern.test(value)) {
            throw new ValidationError(`${fieldName} must be a valid hex color code`, fieldName);
        }

        // Normalize with #
        return value.startsWith('#') ? value : `#${value}`;
    }

    /**
     * Safe JSON parse with validation
     * @param {string} value - JSON string to parse
     * @param {Object} options - Validation options
     * @param {boolean} options.required - Whether value is required
     * @param {string} options.fieldName - Field name for error messages
     * @returns {*} - Parsed JSON
     */
    static json(value, options = {}) {
        const { required = false, fieldName = 'json' } = options;

        // Check required
        if (required && !value) {
            throw new ValidationError(`${fieldName} is required`, fieldName);
        }

        if (!value && !required) {
            return value;
        }

        // Type check
        if (typeof value !== 'string') {
            throw new ValidationError(`${fieldName} must be a JSON string`, fieldName);
        }

        // Parse JSON
        try {
            return JSON.parse(value);
        } catch (err) {
            throw new ValidationError(`${fieldName} is not valid JSON: ${err.message}`, fieldName);
        }
    }

    /**
     * Sanitize filename (remove dangerous characters)
     * @param {string} value - Filename to sanitize
     * @param {Object} options - Validation options
     * @param {number} options.maxLength - Maximum length (default: 255)
     * @param {boolean} options.required - Whether value is required
     * @param {string} options.fieldName - Field name for error messages
     * @returns {string} - Sanitized filename
     */
    static filename(value, options = {}) {
        const { maxLength = 255, required = false, fieldName = 'filename' } = options;

        // Check required
        if (required && !value) {
            throw new ValidationError(`${fieldName} is required`, fieldName);
        }

        if (!value && !required) {
            return value;
        }

        // Type check
        if (typeof value !== 'string') {
            throw new ValidationError(`${fieldName} must be a string`, fieldName);
        }

        // Remove dangerous characters and path traversal
        const sanitized = value
            .replace(/[<>:"|?*]/g, '')  // Remove Windows forbidden chars
            .replace(/\.\./g, '')        // Remove path traversal
            .replace(/^\./, '')          // Remove leading dot
            .replace(/\\/g, '')          // Remove backslashes
            .replace(/\//g, '')          // Remove forward slashes
            .trim();

        // Length check
        if (sanitized.length === 0) {
            throw new ValidationError(`${fieldName} is empty after sanitization`, fieldName);
        }

        if (sanitized.length > maxLength) {
            throw new ValidationError(`${fieldName} must be at most ${maxLength} characters`, fieldName);
        }

        return sanitized;
    }
}

module.exports = { Validators, ValidationError };
