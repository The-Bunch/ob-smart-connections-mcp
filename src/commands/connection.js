import { loadSmartSources } from '../core/data-loader.js';
import { loadPluginSettings } from '../core/config-loader.js';
import { findConnections, applyExclusionFilters } from '../core/search.js';
import { formatPlaintext } from '../formatters/plaintext.js';
import { formatJson } from '../formatters/json.js';
import { resolveNotePath } from '../utils/path-resolver.js';

/**
 * Execute connection command
 * @param {string} notePath - Path to note (absolute or relative)
 * @param {Object} options - Command options
 */
export async function connectionCommand(notePath, options) {
  const vaultPath = options.vault || process.env.OBSIDIAN_VAULT;

  if (!vaultPath) {
    console.error('Error: Vault path not specified. Use --vault or set OBSIDIAN_VAULT.');
    process.exit(1);
  }

  try {
    // Load data
    const sources = loadSmartSources(vaultPath);
    const settings = loadPluginSettings(vaultPath);

    // Resolve note path (handle absolute vs relative)
    const resolvedPath = resolveNotePath(notePath, vaultPath);

    // Find connections
    const skipBlocks = settings.smart_view_filter?.exclude_blocks_from_source_connections || false;
    let results = findConnections(sources, resolvedPath, {
      limit: parseInt(options.limit) || 20,
      skipBlocks
    });

    // Apply exclusion filters from settings
    results = applyExclusionFilters(results, settings);

    // Format and output
    if (options.format === 'json') {
      console.log(formatJson(results));
    } else {
      console.log(formatPlaintext(results, settings));
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
