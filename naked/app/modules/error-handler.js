/**
 * Error Handler Module
 * Standardizes error responses and error handling across the application
 * Provides typed operational errors and safe execution wrappers for routes,
 * socket handlers, and plugin action handlers.
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
    const prefix = context ? `${context}: ` : '';

    // Determine status code and log level based on error type
    let statusCode = error.statusCode || 500;
    const isClientError = statusCode >= 400 && statusCode < 500;

    if (logger) {
        if (isClientError) {
            logger.warn(`${prefix}${error.message}`);
        } else {
            logger.error(`${prefix}${error.message}`, { stack: error.stack });
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

/**
 * Represents a failure in an external dependency (e.g. TTS engine, TikTok API, OSC target).
 * Maps to HTTP 503 Service Unavailable.
 */
class ExternalServiceError extends Error {
    constructor(message = 'External service unavailable') {
        super(message);
        this.name = 'ExternalServiceError';
        this.statusCode = 503;
    }
}

/**
 * Represents a transient failure that the caller may safely retry.
 * Maps to HTTP 503 Service Unavailable with a retryable flag.
 */
class RetryableError extends Error {
    constructor(message = 'Transient error, please retry') {
        super(message);
        this.name = 'RetryableError';
        this.statusCode = 503;
        this.retryable = true;
    }
}

/**
 * Safe Express route wrapper.
 * Catches any synchronous or asynchronous error thrown by the handler,
 * maps it to a structured JSON response and logs it.
 *
 * @param {Function} handler - async (req, res, next) route handler
 * @param {Object} [logger] - optional Winston-compatible logger instance
 * @returns {Function} - wrapped Express route handler
 */
function safeRoute(handler, logger = null) {
    return async (req, res, next) => {
        try {
            await handler(req, res, next);
        } catch (error) {
            const ctx = `${req.method} ${req.path}`;
            const log = logger || (req.app && req.app.locals && req.app.locals.logger) || null;
            handleError(res, error, log, ctx);
        }
    };
}

/**
 * Safe Socket.IO event handler wrapper.
 * Catches any error thrown inside the handler and emits a structured error
 * event back to the originating socket without crashing the server.
 *
 * @param {string} eventName - Socket.IO event name (used for logging and error event)
 * @param {Function} handler - async (socket, data) handler
 * @param {Object} [logger] - optional Winston-compatible logger instance
 * @returns {Function} - wrapped socket event handler
 */
function safeSocketHandler(eventName, handler, logger = null) {
    return async (socket, ...args) => {
        try {
            await handler(socket, ...args);
        } catch (error) {
            if (logger) {
                const isClientError = error.statusCode >= 400 && error.statusCode < 500;
                if (isClientError) {
                    logger.warn(`socket:${eventName}: ${error.message}`);
                } else {
                    logger.error(`socket:${eventName}: ${error.message}`, { stack: error.stack });
                }
            }
            socket.emit('plugin:error', {
                event: eventName,
                error: error.message,
                code: error.name || 'Error',
                statusCode: error.statusCode || 500
            });
        }
    };
}

/**
 * Safe action handler wrapper for plugin bridge actions.
 * Executes the provided async function and maps plain Error instances to
 * typed operational errors where possible, ensuring consistent error shapes
 * propagate to callers.
 *
 * @param {string} actionId - Action identifier (used for logging)
 * @param {Function} fn - async () => result function
 * @param {Object} [logger] - optional Winston-compatible logger instance
 * @returns {Promise<*>} - resolves with the action result
 */
async function safeActionHandler(actionId, fn, logger = null) {
    try {
        return await fn();
    } catch (error) {
        if (logger) {
            const isClientError = error.statusCode >= 400 && error.statusCode < 500;
            if (isClientError) {
                logger.warn(`action:${actionId}: ${error.message}`);
            } else {
                logger.error(`action:${actionId}: ${error.message}`, { stack: error.stack });
            }
        }
        throw error;
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
    safeRoute,
    safeSocketHandler,
    safeActionHandler,
    ValidationError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    RateLimitError,
    ExternalServiceError,
    RetryableError
};
