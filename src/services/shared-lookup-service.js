import { loadSmartSources } from '../core/data-loader.js';
import { loadPluginSettings } from '../core/config-loader.js';
import { LocalEmbeddingService } from '../core/local-embedding-service.js';
import { performLookupWithFilters, validateAndPrepareQuery, getLookupStatistics } from '../core/lookup.js';

/**
 * Shared lookup service that can be used by both CLI and MCP server
 * Provides semantic search functionality with proper embedding generation
 */
export class SharedLookupService {
  constructor(vaultPath, options = {}) {
    this.vaultPath = vaultPath;
    this.options = {
      verbose: false,
      ...options
    };
    this.embeddingService = null;
    this.sources = null;
    this.settings = null;
    this.initialized = false;
  }

  /**
   * Initialize the service by loading data and embedding model
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    if (this.options.verbose) {
      console.log('Loading smart-connections data...');
    }

    // Load plugin settings and smart sources
    [this.settings, this.sources] = await Promise.all([
      loadPluginSettings(this.vaultPath),
      loadSmartSources(this.vaultPath)
    ]);

    if (Object.keys(this.sources).length === 0) {
      throw new Error('No smart sources found. Ensure smart-connections plugin has generated embeddings.');
    }

    // Initialize embedding service
    if (this.options.verbose) {
      console.log('Initializing embedding service...');
    }

    this.embeddingService = new LocalEmbeddingService(this.vaultPath, this.settings);
    await this.embeddingService.initialize();

    // Validate model compatibility
    const sampleEmbeddings = Object.values(this.sources).filter(s => s.vec).slice(0, 5);
    this.embeddingService.validateExactModelCompatibility(sampleEmbeddings);

    if (this.options.verbose) {
      const modelInfo = this.embeddingService.getModelInfo();
      console.log(`Using model: ${modelInfo.modelId} (${modelInfo.dimensions} dimensions)`);

      const stats = getLookupStatistics(this.sources);
      console.log(`Found ${stats.sourcesWithEmbeddings} sources with embeddings`);
      console.log(`Average embedding dimension: ${stats.averageEmbeddingDimension}`);
    }

    this.initialized = true;
  }

  /**
   * Perform semantic lookup
   * @param {string} query - Search query
   * @param {Object} options - Lookup options
   * @param {number} options.limit - Maximum number of results (default: 20)
   * @param {boolean} options.skipBlocks - Exclude block-level results (default: false)
   * @returns {Promise<Array>} Search results
   */
  async lookup(query, options = {}) {
    const {
      limit = 20,
      skipBlocks = false
    } = options;

    if (!this.initialized) {
      await this.initialize();
    }

    // Validate and prepare query
    const validatedQuery = validateAndPrepareQuery(query);

    if (this.options.verbose) {
      console.log(`Query: "${validatedQuery}"`);
      console.log(`Limit: ${limit}, Skip blocks: ${skipBlocks}`);
    }

    // Generate query embedding
    if (this.options.verbose) {
      console.log('Generating query embedding...');
    }

    const embeddingResult = await this.embeddingService.generateEmbedding(validatedQuery);

    if (this.options.verbose) {
      console.log(`Generated embedding with ${embeddingResult.dimensions} dimensions`);
    }

    // Perform semantic lookup
    if (this.options.verbose) {
      console.log('Performing semantic search...');
    }

    const results = performLookupWithFilters(
      this.sources,
      embeddingResult.vec,
      this.settings,
      { limit, skipBlocks }
    );

    if (this.options.verbose) {
      console.log(`Found ${results.length} semantic matches`);
    }

    return results;
  }

  /**
   * Get statistics about the loaded data
   * @returns {Object} Statistics
   */
  getStatistics() {
    if (!this.initialized) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    return getLookupStatistics(this.sources);
  }

  /**
   * Get model information
   * @returns {Object} Model info
   */
  getModelInfo() {
    if (!this.initialized) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    return this.embeddingService.getModelInfo();
  }

  /**
   * Get plugin settings
   * @returns {Object} Plugin settings
   */
  getSettings() {
    if (!this.initialized) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    return this.settings;
  }
}

/**
 * Convenience function to perform a lookup without creating a service instance
 * @param {string} query - Search query
 * @param {string} vaultPath - Path to vault
 * @param {Object} options - Lookup options
 * @returns {Promise<Array>} Search results
 */
export async function performSemanticLookup(query, vaultPath, options = {}) {
  const service = new SharedLookupService(vaultPath, options);
  return await service.lookup(query, options);
}