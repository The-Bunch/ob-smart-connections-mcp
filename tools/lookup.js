import path from 'path';
import { SharedLookupService } from '../src/services/shared-lookup-service.js';

export const lookupTool = {
  name: 'lookup',
  description: 'Perform semantic search using query text to find relevant notes in your Obsidian vault',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query text',
      },
      vault_path: {
        type: 'string',
        description: 'Path to Obsidian vault root (optional if OBSIDIAN_VAULT env var is set)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 20,
      },
      include_blocks: {
        type: 'boolean',
        description: 'Include block-level results in search',
        default: true,
      }
    },
    required: ['query'],
  },
  handler: async (args) => {
    const { query, vault_path: vaultPath, limit = 20, include_blocks = true } = args;

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

      // Create shared lookup service with verbose disabled for MCP output
      const lookupService = new SharedLookupService(targetVaultPath, { verbose: false });

      // Perform semantic lookup
      const results = await lookupService.lookup(query, {
        limit: parseInt(limit) || 20,
        skipBlocks: !include_blocks
      });

      // Format results for MCP response
      const response = {
        query,
        total_found: results.length,
        results: results.map(result => {
          // Convert relative path to absolute path for MCP response
          const relativePath = result.item.path || result.originalKey;
          const absolutePath = path.join(targetVaultPath, relativePath);
          return {
            path: absolutePath,
            title: result.item.name || 'Untitled',
            similarity: result.score,
            excerpt: result.item.excerpt || result.item.name || 'No excerpt available',
            type: result.item.type || 'note',
          };
        }),
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
            text: `Error performing semantic lookup: ${error.message}`,
          },
        ],
      };
    }
  },
};