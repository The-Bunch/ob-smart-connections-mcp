import { loadSmartSources } from '../src/core/data-loader.js';
import { loadPluginSettings } from '../src/core/config-loader.js';

export const validateTool = {
  name: 'validate',
  description: 'Validate Smart Connections data integrity and check for issues in your Obsidian vault',
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

      const validation = {
        vault_path: targetVaultPath,
        timestamp: new Date().toISOString(),
        status: 'valid',
        issues: [],
        warnings: [],
        summary: {
          total_sources: 0,
          sources_with_embeddings: 0,
          sources_without_embeddings: 0,
          sources_missing_paths: 0,
          sources_missing_content: 0,
        }
      };

      // Validate each source
      for (const [key, source] of Object.entries(sources)) {
        validation.summary.total_sources++;

        // Check for embeddings
        if (!source.vec) {
          validation.summary.sources_without_embeddings++;
          validation.issues.push({
            type: 'missing_embeddings',
            key,
            message: 'Source missing embedding vector'
          });
        } else {
          validation.summary.sources_with_embeddings++;
        }

        // Check for path
        if (!source.path) {
          validation.summary.sources_missing_paths++;
          validation.issues.push({
            type: 'missing_path',
            key,
            message: 'Source missing path information'
          });
        }

        // Check for content
        if (!source.content) {
          validation.summary.sources_missing_content++;
          validation.warnings.push({
            type: 'missing_content',
            key,
            message: 'Source missing content - may affect search quality'
          });
        }

        // Validate vector dimensions
        if (source.vec && (!Array.isArray(source.vec) || source.vec.length === 0)) {
          validation.issues.push({
            type: 'invalid_vector',
            key,
            message: 'Invalid embedding vector format'
          });
        }
      }

      // Check settings
      if (!settings.version) {
        validation.warnings.push({
          type: 'settings_version',
          message: 'Plugin version not detected in settings'
        });
      }

      // Overall status
      if (validation.issues.length > 0) {
        validation.status = 'has_issues';
      } else if (validation.warnings.length > 0) {
        validation.status = 'has_warnings';
      }

      // Recommendations
      validation.recommendations = [];

      if (validation.summary.sources_without_embeddings > 0) {
        validation.recommendations.push({
          type: 'reindex',
          message: 'Consider re-indexing your vault to generate missing embeddings',
          count: validation.summary.sources_without_embeddings
        });
      }

      if (validation.summary.sources_missing_content > 0) {
        validation.recommendations.push({
          type: 'check_content',
          message: 'Some sources are missing content which may affect search results',
          count: validation.summary.sources_missing_content
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(validation, null, 2),
          },
        ],
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error validating vault: ${error.message}`,
          },
        ],
      };
    }
  },
};