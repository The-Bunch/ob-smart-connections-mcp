import { SharedConnectionService } from '../services/shared-connection-service.js';
import { formatPlaintext } from '../formatters/plaintext.js';
import { formatJson } from '../formatters/json.js';

/**
 * Execute connection command
 * @param {string} notePath - Path to note (absolute or relative)
 * @param {Object} options - Command options
 */
export async function connectionCommand(notePath, options) {
  const {
    vault: vaultOption,
    format = 'plaintext',
    limit = 20,
    skipBlocks = false,
    verbose = false
  } = options;

  const vaultPath = vaultOption || process.env.OBSIDIAN_VAULT;

  if (!vaultPath) {
    console.error('Error: Vault path not specified. Use --vault or set OBSIDIAN_VAULT.');
    process.exit(1);
  }

  try {
    // Create shared connection service
    const connectionService = new SharedConnectionService(vaultPath, { verbose });

    // Initialize service (this will show progress messages if verbose)
    await connectionService.initialize();

    // Find connections
    const result = await connectionService.findConnections(notePath, {
      limit,
      includeBlocks: !skipBlocks
    });

    if (result.connections.length === 0) {
      console.log(`No connections found for: ${result.queryNote}`);
      return;
    }

    // Format and output
    const output = format === 'json'
      ? formatJson(result.connections)
      : formatPlaintext(result.connections, connectionService.settings);

    console.log(output);

    if (verbose && format === 'plaintext') {
      console.log(`\nFound ${result.connections.length} connections for: ${result.queryNote}`);
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
