/**
 * Vector Memory System for AnimazingPal Brain
 * Implements semantic memory search using vector embeddings
 * 
 * Architecture:
 * - Database = Nervous System (stores raw memories)
 * - Vector Matrix = Synaptic Connections (links related memories)
 * - GPT = Brain (processes and generates responses)
 * - Animaze = Body/Voice (expresses the output)
 */

class VectorMemory {
  constructor(logger) {
    this.logger = logger;
    
    // In-memory vector store for fast semantic search
    this.vectors = new Map(); // memoryId -> vector
    this.vocabulary = new Map(); // word -> index
    this.vocabIndex = 0;
    
    // TF-IDF components
    this.documentFrequency = new Map(); // word -> document count
    this.totalDocuments = 0;
    
    // Configuration
    this.vectorDimension = 256; // Dimension of semantic vectors
    this.maxVocabSize = 10000;
    this.minWordLength = 2;
    
    // Stopwords (German + English common words to ignore)
    this.stopwords = new Set([
      'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'aber', 'ist', 'sind',
      'war', 'waren', 'hat', 'haben', 'wird', 'werden', 'kann', 'können',
      'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mein', 'dein', 'sein',
      'mit', 'von', 'zu', 'bei', 'für', 'auf', 'an', 'in', 'aus', 'nach',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her',
      'its', 'our', 'their', 'this', 'that', 'these', 'those', 'what', 'which',
      'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'all', 'each',
      'and', 'or', 'but', 'if', 'then', 'else', 'so', 'as', 'to', 'of', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'not', 'no', 'yes'
    ]);
  }

  /**
   * Tokenize and clean text
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    
    return text.toLowerCase()
      .replace(/[^\w\säöüß]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length >= this.minWordLength && 
        !this.stopwords.has(word) &&
        !/^\d+$/.test(word)
      );
  }

  /**
   * Get or create vocabulary index for a word
   */
  getWordIndex(word) {
    if (!this.vocabulary.has(word)) {
      if (this.vocabulary.size >= this.maxVocabSize) {
        // Vocabulary full, use hash-based index
        return Math.abs(this.hashString(word)) % this.vectorDimension;
      }
      this.vocabulary.set(word, this.vocabIndex++);
    }
    return this.vocabulary.get(word);
  }

  /**
   * Simple hash function for strings
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Create a vector embedding for text
   * Uses TF-IDF inspired approach
   */
  createEmbedding(text) {
    const tokens = this.tokenize(text);
    const vector = new Float32Array(this.vectorDimension);
    
    if (tokens.length === 0) return Array.from(vector);
    
    // Count term frequencies
    const termFreq = new Map();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }
    
    // Create weighted vector
    for (const [word, count] of termFreq) {
      const wordIndex = this.getWordIndex(word) % this.vectorDimension;
      
      // TF-IDF weight
      const tf = count / tokens.length;
      const idf = Math.log((this.totalDocuments + 1) / (this.documentFrequency.get(word) || 1) + 1);
      const weight = tf * idf;
      
      // Distribute across dimensions using hash-based spreading
      for (let i = 0; i < 4; i++) {
        const idx = (wordIndex + i * 64) % this.vectorDimension;
        const sign = (this.hashString(word + i) % 2 === 0) ? 1 : -1;
        vector[idx] += weight * sign;
      }
    }
    
    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }
    
    return Array.from(vector);
  }

  /**
   * Add a document to the corpus (updates IDF)
   */
  addDocument(text) {
    const tokens = new Set(this.tokenize(text));
    this.totalDocuments++;
    
    for (const token of tokens) {
      this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
    }
  }

  /**
   * Store a memory vector
   */
  storeVector(memoryId, text) {
    this.addDocument(text);
    const vector = this.createEmbedding(text);
    this.vectors.set(memoryId, vector);
    return vector;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Find similar memories by vector similarity
   */
  findSimilar(queryText, topK = 10, threshold = 0.1) {
    const queryVector = this.createEmbedding(queryText);
    const similarities = [];
    
    for (const [memoryId, vector] of this.vectors) {
      const similarity = this.cosineSimilarity(queryVector, vector);
      if (similarity >= threshold) {
        similarities.push({ memoryId, similarity });
      }
    }
    
    // Sort by similarity descending
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    return similarities.slice(0, topK);
  }

  /**
   * Load vectors from database memories
   */
  loadFromMemories(memories) {
    for (const memory of memories) {
      if (memory.embedding) {
        try {
          const vector = JSON.parse(memory.embedding);
          this.vectors.set(memory.id, vector);
        } catch (e) {
          // Regenerate vector if embedding is invalid
          this.storeVector(memory.id, memory.content);
        }
      } else {
        this.storeVector(memory.id, memory.content);
      }
    }
    
    this.logger.info(`Loaded ${this.vectors.size} memory vectors`);
  }

  /**
   * Remove a memory vector
   */
  removeVector(memoryId) {
    this.vectors.delete(memoryId);
  }

  /**
   * Clear all vectors
   */
  clear() {
    this.vectors.clear();
    this.vocabulary.clear();
    this.documentFrequency.clear();
    this.vocabIndex = 0;
    this.totalDocuments = 0;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      totalVectors: this.vectors.size,
      vocabularySize: this.vocabulary.size,
      totalDocuments: this.totalDocuments,
      vectorDimension: this.vectorDimension
    };
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(text, topK = 5) {
    const tokens = this.tokenize(text);
    const termFreq = new Map();
    
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }
    
    // Score by TF-IDF
    const scores = [];
    for (const [word, count] of termFreq) {
      const tf = count / tokens.length;
      const idf = Math.log((this.totalDocuments + 1) / (this.documentFrequency.get(word) || 1) + 1);
      scores.push({ word, score: tf * idf });
    }
    
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK).map(s => s.word);
  }

  /**
   * Cluster memories by similarity
   */
  clusterMemories(minSimilarity = 0.5) {
    const clusters = [];
    const assigned = new Set();
    
    for (const [memoryId, vector] of this.vectors) {
      if (assigned.has(memoryId)) continue;
      
      const cluster = [memoryId];
      assigned.add(memoryId);
      
      for (const [otherId, otherVector] of this.vectors) {
        if (assigned.has(otherId)) continue;
        
        const similarity = this.cosineSimilarity(vector, otherVector);
        if (similarity >= minSimilarity) {
          cluster.push(otherId);
          assigned.add(otherId);
        }
      }
      
      if (cluster.length > 0) {
        clusters.push(cluster);
      }
    }
    
    return clusters;
  }
}

module.exports = VectorMemory;
