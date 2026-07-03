/**
 * IndexedDB Cache for Frontend
 *
 * Caches:
 * - MyInstants search results
 * - Gift icons
 * - Favorites
 * - Trending sounds
 */

class IndexedDBCache {
  constructor(dbName = 'TikTokHelperCache', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  /**
   * Initialize IndexedDB
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // MyInstants search cache (key: search query, value: results)
        if (!db.objectStoreNames.contains('myinstants_search')) {
          const store = db.createObjectStore('myinstants_search', { keyPath: 'query' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Gift icons cache (key: giftId, value: iconUrl)
        if (!db.objectStoreNames.contains('gift_icons')) {
          db.createObjectStore('gift_icons', { keyPath: 'giftId' });
        }

        // Favorites (key: id, value: sound data)
        if (!db.objectStoreNames.contains('favorites')) {
          const favStore = db.createObjectStore('favorites', { keyPath: 'id', autoIncrement: true });
          favStore.createIndex('url', 'url', { unique: false });
        }

        // Trending sounds cache (key: 'trending', value: results)
        if (!db.objectStoreNames.contains('trending')) {
          db.createObjectStore('trending', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Set cache entry
   */
  async set(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get cache entry
   */
  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all entries from a store
   */
  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete cache entry
   */
  async delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all cache
   */
  async clearAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Cache MyInstants search results
   */
  async cacheSearch(query, results, ttl = 5 * 60 * 1000) {
    await this.set('myinstants_search', {
      query,
      results,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Get cached search results
   */
  async getCachedSearch(query) {
    const cached = await this.get('myinstants_search', query);
    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > cached.ttl) {
      await this.delete('myinstants_search', query);
      return null;
    }

    return cached.results;
  }

  /**
   * Cache gift icon
   */
  async cacheGiftIcon(giftId, iconUrl) {
    await this.set('gift_icons', { giftId, iconUrl, timestamp: Date.now() });
  }

  /**
   * Get cached gift icon
   */
  async getCachedGiftIcon(giftId) {
    const cached = await this.get('gift_icons', giftId);
    return cached ? cached.iconUrl : null;
  }

  /**
   * Add to favorites
   */
  async addFavorite(soundData) {
    // Check if already exists
    const existing = await this.getFavorites();
    const duplicate = existing.find(f => f.url === soundData.url);
    if (duplicate) return duplicate;

    return await this.set('favorites', {
      ...soundData,
      addedAt: Date.now()
    });
  }

  /**
   * Get favorites
   */
  async getFavorites() {
    return await this.getAll('favorites');
  }

  /**
   * Remove from favorites
   */
  async removeFavorite(id) {
    await this.delete('favorites', id);
  }

  /**
   * Cache trending sounds
   */
  async cacheTrending(results, ttl = 15 * 60 * 1000) {
    await this.set('trending', {
      key: 'trending',
      results,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Get cached trending
   */
  async getCachedTrending() {
    const cached = await this.get('trending', 'trending');
    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > cached.ttl) {
      await this.delete('trending', 'trending');
      return null;
    }

    return cached.results;
  }

  /**
   * Clean expired cache entries
   */
  async cleanExpired() {
    // Clean search cache
    const searches = await this.getAll('myinstants_search');
    for (const search of searches) {
      if (Date.now() - search.timestamp > search.ttl) {
        await this.delete('myinstants_search', search.query);
      }
    }

    // Clean trending cache
    const trending = await this.get('trending', 'trending');
    if (trending && Date.now() - trending.timestamp > trending.ttl) {
      await this.delete('trending', 'trending');
    }
  }
}

// Global instance
const dbCache = new IndexedDBCache();

// Initialize on load
dbCache.init().catch(err => console.error('Failed to init IndexedDB:', err));
