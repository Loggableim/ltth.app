/**
 * Error Handler Module
 * Standardizes error responses and error handling across the application
 */

const { ValidationError } = require('./validators');

/**
 * Standard error response format
 * @param {Error} error - Error object
 * @param {number} statusCode - HTTP status code (default: 500)
 * @returns {Object} - Standardized error response
 */
function formatError(error, statusCode = 500) {
    const response = {
        success: false,
        error: error.message || 'An unknown error occurred'
    };

    // Add error code if available
    if (error.code) {
        response.errorCode = error.code;
    }

    // Add field information for validation errors
    if (error.field) {
        response.field = error.field;
    }

    // Add stack trace in development mode (only if NODE_ENV is set)
    if (process.env.NODE_ENV === 'development' && error.stack) {
        response.stack = error.stack;
    }

    return response;
}

/**
 * Handle error and send standardized response
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {Object} logger - Logger instance
 * @param {string} context - Context description for logging
 */
function handleError(res, error, logger, context = '') {
    // Determine status code
    let statusCode = 500;

    if (error instanceof ValidationError) {
        statusCode = 400;
        if (logger) {
            logger.warn(`${context ? context + ': ' : ''}${error.message}`);
        }
    } else if (error.statusCode) {
        statusCode = error.statusCode;
        if (logger) {
            logger.error(`${context ? context + ': ' : ''}${error.message}`);
        }
    } else if (error.name === 'NotFoundError' || error.message.includes('not found')) {
        statusCode = 404;
        if (logger) {
            logger.warn(`${context ? context + ': ' : ''}${error.message}`);
        }
    } else if (error.name === 'UnauthorizedError' || error.message.includes('unauthorized')) {
        statusCode = 401;
        if (logger) {
            logger.warn(`${context ? context + ': ' : ''}${error.message}`);
        }
    } else if (error.name === 'ForbiddenError' || error.message.includes('forbidden')) {
        statusCode = 403;
        if (logger) {
            logger.warn(`${context ? context + ': ' : ''}${error.message}`);
        }
    } else {
        // Unknown error - log as error
        if (logger) {
            logger.error(`${context ? context + ': ' : ''}${error.message}`, error);
        }
    }

    res.status(statusCode).json(formatError(error, statusCode));
}

/**
 * Async error wrapper for Express routes
 * Wraps async functions to catch errors and pass them to error handler
 * @param {Function} fn - Async route handler function
 * @returns {Function} - Wrapped function
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Express error middleware
 * Global error handler for Express
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
function errorMiddleware(err, req, res, next) {
    // Get logger from app locals if available
    const logger = req.app.locals.logger;

    handleError(res, err, logger, `${req.method} ${req.path}`);
}

/**
 * Safe JSON parse with error handling
 * @param {string} jsonString - JSON string to parse
 * @param {*} defaultValue - Default value if parse fails
 * @param {Object} logger - Logger instance
 * @returns {*} - Parsed object or default value
 */
function safeJsonParse(jsonString, defaultValue = null, logger = null) {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        if (logger) {
            logger.warn(`JSON parse failed: ${error.message}`);
        }
        return defaultValue;
    }
}

/**
 * Safe async operation with timeout
 * @param {Function} fn - Async function to execute
 * @param {number} timeout - Timeout in milliseconds
 * @param {string} timeoutMessage - Custom timeout error message
 * @returns {Promise} - Promise that resolves or rejects
 */
function withTimeout(fn, timeout = 5000, timeoutMessage = 'Operation timed out') {
    return Promise.race([
        fn(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(timeoutMessage)), timeout)
        )
    ]);
}

/**
 * Retry async operation with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {Function} options.shouldRetry - Function to determine if should retry (default: always true)
 * @param {Object} options.logger - Logger instance
 * @returns {Promise} - Promise that resolves or rejects
 */
async function retryWithBackoff(fn, options = {}) {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 10000,
        shouldRetry = () => true,
        logger = null
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt === maxRetries || !shouldRetry(error)) {
                throw error;
            }

            if (logger) {
                logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${error.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * 2, maxDelay);
        }
    }

    throw lastError;
}

/**
 * Create custom error classes
 */
class NotFoundError extends Error {
    constructor(message = 'Resource not found') {
        super(message);
        this.name = 'NotFoundError';
        this.statusCode = 404;
    }
}

class UnauthorizedError extends Error {
    constructor(message = 'Unauthorized') {
        super(message);
        this.name = 'UnauthorizedError';
        this.statusCode = 401;
    }
}

class ForbiddenError extends Error {
    constructor(message = 'Forbidden') {
        super(message);
        this.name = 'ForbiddenError';
        this.statusCode = 403;
    }
}

class ConflictError extends Error {
    constructor(message = 'Conflict') {
        super(message);
        this.name = 'ConflictError';
        this.statusCode = 409;
    }
}

class RateLimitError extends Error {
    constructor(message = 'Too many requests') {
        super(message);
        this.name = 'RateLimitError';
        this.statusCode = 429;
    }
}

module.exports = {
    formatError,
    handleError,
    asyncHandler,
    errorMiddleware,
    safeJsonParse,
    withTimeout,
    retryWithBackoff,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    RateLimitError
};
