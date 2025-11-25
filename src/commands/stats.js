import { loadSmartSources } from '../core/data-loader.js';
import { loadPluginSettings } from '../core/config-loader.js';
import { formatJson } from '../formatters/json.js';

/**
 * Calculate and display vault statistics
 * @param {Object} options - Command options
 */
export async function statsCommand(options) {
  const vaultPath = options.vault || process.env.OBSIDIAN_VAULT;

  if (!vaultPath) {
    console.error('Error: Vault path not specified. Use --vault or set OBSIDIAN_VAULT.');
    process.exit(1);
  }

  try {
    const sources = loadSmartSources(vaultPath);
    const settings = loadPluginSettings(vaultPath);

    // Calculate statistics
    const stats = calculateStats(sources, settings);

    // Format and output
    if (options.format === 'json') {
      console.log(formatJson(stats));
    } else {
      console.log(formatStatsOutput(stats));
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

function calculateStats(sources, settings) {
  const allEntries = Object.entries(sources);

  const totalSources = allEntries.length;
  const sourceFiles = allEntries.filter(([key]) => !key.includes('#'));
  const blocks = allEntries.filter(([key]) => key.includes('#'));

  const withEmbeddings = allEntries.filter(([_, src]) => src.vec && src.vec.length > 0);
  const withoutEmbeddings = allEntries.filter(([_, src]) => !src.vec || src.vec.length === 0);

  // Get embedding model info
  const embeddingModels = new Set(
    withEmbeddings.map(([_, src]) => src.embed_model || src.embedding_model || 'unknown')
  );

  // Calculate vector dimension (from first embedded item)
  const firstEmbedded = withEmbeddings[0]?.[1];
  const vectorDimension = firstEmbedded?.vec?.length || 0;

  // Estimate storage size (rough calculation)
  const bytesPerFloat = 4; // Float32
  const estimatedEmbeddingSize = withEmbeddings.length * vectorDimension * bytesPerFloat;

  return {
    total_sources: totalSources,
    source_files: sourceFiles.length,
    blocks: blocks.length,
    with_embeddings: withEmbeddings.length,
    without_embeddings: withoutEmbeddings.length,
    coverage_percent: totalSources > 0 ? ((withEmbeddings.length / totalSources) * 100).toFixed(1) : '0.0',
    embedding_models: Array.from(embeddingModels),
    vector_dimension: vectorDimension,
    estimated_size_mb: (estimatedEmbeddingSize / 1024 / 1024).toFixed(2),
    settings: {
      min_chars: settings.smart_sources?.min_chars || 200,
      file_exclusions: settings.smart_sources?.file_exclusions || '',
      folder_exclusions: settings.smart_sources?.folder_exclusions || '',
      exclude_blocks: settings.smart_view_filter?.exclude_blocks_from_source_connections || false
    }
  };
}

function formatStatsOutput(stats) {
  return `
Smart Connections Vault Statistics
===================================

Sources:
  Total entries: ${stats.total_sources}
  Files: ${stats.source_files}
  Blocks: ${stats.blocks}

Embeddings:
  With embeddings: ${stats.with_embeddings}
  Without embeddings: ${stats.without_embeddings}
  Coverage: ${stats.coverage_percent}%

Model Info:
  Embedding model(s): ${stats.embedding_models.join(', ')}
  Vector dimension: ${stats.vector_dimension}
  Estimated size: ${stats.estimated_size_mb} MB

Settings:
  Min characters: ${stats.settings.min_chars}
  File exclusions: ${stats.settings.file_exclusions || '(none)'}
  Folder exclusions: ${stats.settings.folder_exclusions || '(none)'}
  Exclude blocks: ${stats.settings.exclude_blocks}
`.trim();
}
