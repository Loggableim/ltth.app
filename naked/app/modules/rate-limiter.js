/**
 * Rate Limiter Module
 *
 * Protects API endpoints from abuse/DoS attacks
 * - General API: 100 requests/minute
 * - Auth endpoints: 10 requests/minute
 * - File uploads: 20 requests/minute
 * - Plugin management: 200 requests/minute (lenient for admin operations)
 * - IFTTT operations: 300 requests/minute (lenient for frequent polling)
 */

const rateLimit = require('express-rate-limit');
const logger = require('./logger');

// General API rate limiter (100 req/min)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    error: 'Too many requests from this IP, please try again after a minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again after a minute'
    });
  }
});

// Stricter rate limiter for auth/connection endpoints (10 req/min)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    error: 'Too many connection attempts, please try again after a minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Too many connection attempts, please try again after a minute'
    });
  }
});

// File upload rate limiter (20 req/min)
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: {
    error: 'Too many file uploads, please try again after a minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Upload rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Too many file uploads, please try again after a minute'
    });
  }
});

// More lenient rate limiter for plugin management operations (200 req/min)
// Plugin operations are typically admin actions and may require multiple
// rapid requests (e.g., refreshing all plugins, enabling multiple plugins)
// Increased from 30 to 200 to prevent legitimate admin operations from being blocked
// Skips rate limiting for localhost to allow unrestricted local admin access
const pluginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: {
    error: 'Too many plugin operations, please slow down and try again in a moment'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for localhost/127.0.0.1 to allow unrestricted local admin access
    // Use req.ip (when trust proxy is enabled) or req.socket.remoteAddress as fallback
    // SECURITY NOTE: This is safe for local-only applications. If exposing to the internet,
    // ensure proper network security and consider additional IP validation.
    const ip = req.ip || req.socket.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  },
  handler: (req, res) => {
    logger.warn('Plugin management rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Too many plugin operations, please slow down and try again in a moment'
    });
  }
});

// Lenient rate limiter for IFTTT operations (300 req/min)
// IFTTT Flow Editor uses frequent polling (every 2-5 seconds) for real-time updates
// of execution history and statistics. This requires a higher rate limit to prevent
// legitimate monitoring operations from being blocked.
// Skips rate limiting for localhost to allow unrestricted local admin access
const iftttLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: {
    error: 'Too many IFTTT requests, please slow down and try again in a moment'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for localhost/127.0.0.1 to allow unrestricted local admin access
    // Use req.ip (when trust proxy is enabled) or req.socket.remoteAddress as fallback
    // SECURITY NOTE: This is safe for local-only applications. If exposing to the internet,
    // ensure proper network security and consider additional IP validation.
    const ip = req.ip || req.socket.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  },
  handler: (req, res) => {
    logger.warn('IFTTT rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Too many IFTTT requests, please slow down and try again in a moment'
    });
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  uploadLimiter,
  pluginLimiter,
  iftttLimiter
};
