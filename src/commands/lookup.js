import { SharedLookupService } from '../services/shared-lookup-service.js';
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
    // Resolve vault path
    const vaultPath = vaultOption || process.env.OBSIDIAN_VAULT;

    if (!vaultPath) {
      console.error('Error: Vault path not specified. Use --vault or set OBSIDIAN_VAULT.');
      process.exit(1);
    }

    // Create shared lookup service
    const lookupService = new SharedLookupService(vaultPath, { verbose });

    // Initialize service (this will show progress messages if verbose)
    await lookupService.initialize();

    // Perform semantic lookup
    const results = await lookupService.lookup(query, { limit, skipBlocks });

    if (results.length === 0) {
      console.log('No results found for your query.');
      console.log('Try using different keywords or check if your vault has relevant content.');
      return;
    }

    // Format and output results
    const output = format === 'json'
      ? formatJson(results)
      : formatPlaintext(results, lookupService.settings);

    console.log(output);

    if (verbose && format === 'plaintext') {
      console.log(`\nFound ${results.length} semantic matches for: "${query}"`);
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
