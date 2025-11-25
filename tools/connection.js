import path from 'path';
import { SharedConnectionService } from '../src/services/shared-connection-service.js';

export const connectionTool = {
  name: 'connection',
  description: 'Find notes semantically similar to a specified note in your Obsidian vault',
  inputSchema: {
    type: 'object',
    properties: {
      note_path: {
        type: 'string',
        description: 'Path to the note file (absolute or relative to vault)',
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
        description: 'Include block-level connections in results',
        default: true,
      }
    },
    required: ['note_path'],
  },
  handler: async (args) => {
    const { note_path: notePath, vault_path: vaultPath, limit = 20, include_blocks = true } = args;

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

      // Create shared connection service with verbose disabled for MCP output
      const connectionService = new SharedConnectionService(targetVaultPath, { verbose: false });

      // Find connections
      const result = await connectionService.findConnections(notePath, {
        limit: parseInt(limit) || 20,
        includeBlocks: include_blocks
      });

      // Format results for MCP response
      const response = {
        query_note: result.queryNote,
        total_results: result.connections.length,
        connections: result.connections.map(connection => {
          // Convert relative path to absolute path for MCP response
          const absolutePath = path.join(targetVaultPath, connection.path);
          return {
            path: absolutePath,
            title: connection.name || connection.path.split('/').pop()?.replace('.md', ''),
            similarity: connection.score,
            excerpt: connection.excerpt || '',
            type: connection.type || 'note',
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
            text: `Error finding connections: ${error.message}`,
          },
        ],
      };
    }
  },
};