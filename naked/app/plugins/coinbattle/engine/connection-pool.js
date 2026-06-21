/**
 * WebSocket Connection Pool
 * Optimizes socket connections by reusing idle connections
 * Performance Optimization #1
 */

class SocketConnectionPool {
  constructor(maxConnections = 50, logger = console) {
    this.maxConnections = maxConnections;
    this.logger = logger;
    
    // Pool of idle connections ready for reuse
    this.idlePool = [];
    
    // Map of active connections by userId
    this.activeConnections = new Map();
    
    // Connection statistics
    this.stats = {
      created: 0,
      reused: 0,
      released: 0,
      active: 0,
      peak: 0
    };
    
    // Cleanup interval (every 30 seconds)
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
    
    this.logger.info(`📡 SocketConnectionPool initialized (max: ${maxConnections})`);
  }

  /**
   * Get a connection for a user (reuse or create)
   */
  getConnection(userId, socketId) {
    // Check if user already has an active connection
    if (this.activeConnections.has(userId)) {
      const existing = this.activeConnections.get(userId);
      if (existing.socketId === socketId) {
        existing.lastUsed = Date.now();
        return existing;
      }
      // Different socket - release old and create new
      this.releaseConnection(userId);
    }

    // Try to reuse an idle connection
    let connection;
    if (this.idlePool.length > 0) {
      connection = this.idlePool.pop();
      connection.userId = userId;
      connection.socketId = socketId;
      connection.lastUsed = Date.now();
      connection.createdAt = connection.createdAt || Date.now();
      this.stats.reused++;
    } else {
      // Create new connection if pool not at max
      if (this.activeConnections.size < this.maxConnections) {
        connection = this.createConnection(userId, socketId);
        this.stats.created++;
      } else {
        // Pool exhausted - evict least recently used
        const lru = this.findLRU();
        if (lru) {
          this.logger.warn(`⚠️ Pool exhausted, evicting LRU connection for user ${lru.userId}`);
          this.releaseConnection(lru.userId);
          connection = this.createConnection(userId, socketId);
          this.stats.created++;
        } else {
          throw new Error('Connection pool exhausted and no LRU found');
        }
      }
    }

    this.activeConnections.set(userId, connection);
    this.stats.active = this.activeConnections.size;
    this.stats.peak = Math.max(this.stats.peak, this.stats.active);

    return connection;
  }

  /**
   * Create a new connection object
   */
  createConnection(userId, socketId) {
    return {
      userId,
      socketId,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      metadata: {}
    };
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(userId) {
    const connection = this.activeConnections.get(userId);
    if (!connection) return false;

    this.activeConnections.delete(userId);
    
    // Clean connection for reuse
    connection.userId = null;
    connection.socketId = null;
    connection.metadata = {};
    connection.lastUsed = Date.now();

    // Add to idle pool if not at capacity
    if (this.idlePool.length < this.maxConnections / 2) {
      this.idlePool.push(connection);
      this.stats.released++;
    }

    this.stats.active = this.activeConnections.size;
    return true;
  }

  /**
   * Find least recently used connection
   */
  findLRU() {
    let lru = null;
    let oldestTime = Date.now();

    for (const [userId, connection] of this.activeConnections) {
      if (connection.lastUsed < oldestTime) {
        oldestTime = connection.lastUsed;
        lru = connection;
      }
    }

    return lru;
  }

  /**
   * Cleanup stale connections
   */
  cleanup() {
    const now = Date.now();
    const staleTimeout = 5 * 60 * 1000; // 5 minutes

    // Clean idle pool
    const initialIdleSize = this.idlePool.length;
    this.idlePool = this.idlePool.filter(conn => {
      return now - conn.lastUsed < staleTimeout;
    });

    // Clean stale active connections
    const staleConnections = [];
    for (const [userId, connection] of this.activeConnections) {
      if (now - connection.lastUsed > staleTimeout) {
        staleConnections.push(userId);
      }
    }

    staleConnections.forEach(userId => this.releaseConnection(userId));

    if (initialIdleSize !== this.idlePool.length || staleConnections.length > 0) {
      this.logger.info(
        `🧹 Cleanup: Removed ${initialIdleSize - this.idlePool.length} idle, ` +
        `${staleConnections.length} stale active connections`
      );
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      ...this.stats,
      idle: this.idlePool.length,
      utilization: ((this.stats.active / this.maxConnections) * 100).toFixed(1) + '%'
    };
  }

  /**
   * Destroy the pool
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.activeConnections.clear();
    this.idlePool = [];
    this.logger.info('📡 SocketConnectionPool destroyed');
  }
}

module.exports = SocketConnectionPool;
