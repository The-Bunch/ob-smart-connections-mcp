import { loadSmartSources } from '../core/data-loader.js';
import { loadPluginSettings } from '../core/config-loader.js';
import { LocalEmbeddingService } from '../core/local-embedding-service.js';
import { performLookupWithFilters, validateAndPrepareQuery, getLookupStatistics } from '../core/lookup.js';
import { formatPlaintext } from '../formatters/plaintext.js';
import { formatJson } from '../formatters/json.js';

/**
 * Lookup command - semantic search using query embeddings
 * @param {string} query - Search query
 * @param {Object} options - Command options
 * @param {string} options.vault - Path to vault
 * @param {string} options.format - Output format ('plaintext' | 'json')
 * @param {number} options.limit - Maximum number of results
 * @param {boolean} options.skipBlocks - Exclude block-level results
 * @param {boolean} options.verbose - Show detailed information
 */
export async function lookupCommand(query, options = {}) {
  const {
    vault: vaultOption,
    format = 'plaintext',
    limit = 20,
    skipBlocks = false,
    verbose = false
  } = options;

  try {
    // Validate and prepare query
    const validatedQuery = validateAndPrepareQuery(query);

    if (verbose) {
      console.log(`Query: "${validatedQuery}"`);
      console.log(`Limit: ${limit}, Format: ${format}, Skip blocks: ${skipBlocks}`);
    }

    // Resolve vault path
    const vaultPath = vaultOption || process.env.OBSIDIAN_VAULT;

    if (!vaultPath) {
      console.error('Error: Vault path not specified. Use --vault or set OBSIDIAN_VAULT.');
      process.exit(1);
    }

    // Load plugin settings and smart sources
    console.log('Loading smart-connections data...');
    const [settings, sources] = await Promise.all([
      loadPluginSettings(vaultPath),
      loadSmartSources(vaultPath)
    ]);

    if (Object.keys(sources).length === 0) {
      console.error('No smart sources found. Ensure smart-connections plugin has generated embeddings.');
      process.exit(1);
    }

    // Show statistics if verbose
    if (verbose) {
      const stats = getLookupStatistics(sources);
      console.log(`Found ${stats.sourcesWithEmbeddings} sources with embeddings`);
      console.log(`Average embedding dimension: ${stats.averageEmbeddingDimension}`);
    }

    // Initialize embedding service
    console.log('Initializing embedding service...');
    const embeddingService = new LocalEmbeddingService(vaultPath, settings);
    await embeddingService.initialize();

    // Validate model compatibility
    const sampleEmbeddings = Object.values(sources).filter(s => s.vec).slice(0, 5);
    embeddingService.validateExactModelCompatibility(sampleEmbeddings);

    if (verbose) {
      const modelInfo = embeddingService.getModelInfo();
      console.log(`Using model: ${modelInfo.modelId} (${modelInfo.dimensions} dimensions)`);
    }

    // Generate query embedding
    console.log('Generating query embedding...');
    const embeddingResult = await embeddingService.generateEmbedding(validatedQuery);

    if (verbose) {
      console.log(`Generated embedding with ${embeddingResult.dimensions} dimensions`);
    }

    // Perform semantic lookup
    console.log('Performing semantic search...');
    const results = performLookupWithFilters(
      sources,
      embeddingResult.vec,
      settings,
      { limit, skipBlocks }
    );

    if (results.length === 0) {
      console.log('No results found for your query.');
      console.log('Try using different keywords or check if your vault has relevant content.');
      return;
    }

    // Format and output results
    const output = format === 'json'
      ? formatJson(results)
      : formatPlaintext(results, settings);

    console.log(output);

    if (verbose && format === 'plaintext') {
      console.log(`\nFound ${results.length} semantic matches for: "${validatedQuery}"`);
    }

  } catch (error) {
    console.error(`Error during lookup: ${error.message}`);

    if (verbose) {
      console.error(error.stack);
    }

    // Provide helpful error messages
    if (error.message.includes('model incompatibility')) {
      console.error('');
      console.error('Model compatibility issue detected.');
      console.error('Ensure your smart-connections plugin is using the same embedding model.');
      console.error('Check your plugin settings in Obsidian: Settings > Smart Connections');
    }

    if (error.message.includes('Could not detect embedding model')) {
      console.error('');
      console.error('No embedding model detected.');
      console.error('Please ensure smart-connections plugin is configured and has generated embeddings.');
      console.error('You can trigger embedding generation by opening Obsidian and using Smart Connections.');
    }

    process.exit(1);
  }
}
