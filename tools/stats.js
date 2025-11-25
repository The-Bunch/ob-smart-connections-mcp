import { loadSmartSources } from '../src/core/data-loader.js';
import { loadPluginSettings } from '../src/core/config-loader.js';

export const statsTool = {
  name: 'stats',
  description: 'Show embedding and vault statistics for your Obsidian vault',
  inputSchema: {
    type: 'object',
    properties: {
      vault_path: {
        type: 'string',
        description: 'Path to Obsidian vault root (optional if OBSIDIAN_VAULT env var is set)',
      },
    },
    required: [],
  },
  handler: async (args) => {
    const { vault_path: vaultPath } = args;

    if (!vaultPath && !process.env.OBSIDIAN_VAULT) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Vault path not specified. Provide vault_path argument or set OBSIDIAN_VAULT environment variable.',
          },
        ],
      };
    }

    try {
      const targetVaultPath = vaultPath || process.env.OBSIDIAN_VAULT;

      // Load data
      const sources = loadSmartSources(targetVaultPath);
      const settings = loadPluginSettings(targetVaultPath);

      // Get embedding models
      const embeddingModels = [...new Set(Object.values(sources)
        .filter(source => source.embed_model)
        .map(source => source.embed_model))];

      // Calculate statistics
      const response = {
        vault_path: targetVaultPath,
        total_indexed_sources: Object.keys(sources).length,
        sources_with_embeddings: Object.values(sources).filter(source => source.vec).length,
        embedding_model: embeddingModels.length > 0 ? embeddingModels[0] : 'Unknown',
        last_updated: new Date().toISOString(),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting vault statistics: ${error.message}`,
          },
        ],
      };
    }
  },
};