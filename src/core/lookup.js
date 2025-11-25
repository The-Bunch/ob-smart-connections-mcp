import { cosineSimilarity } from './similarity.js';
import { applyExclusionFilters } from './search.js';

/**
 * Perform semantic lookup for a query embedding against existing note embeddings
 * @param {Object} sources - All smart sources with embeddings
 * @param {Array<number>} queryEmbedding - Query embedding vector
 * @param {Object} options - Lookup options
 * @param {number} options.limit - Maximum number of results (default: 20)
 * @param {boolean} options.skipBlocks - Exclude block-level results
 * @param {Array<string>} options.excludeKeys - Keys to exclude from results
 * @returns {Array<{item: Object, score: number}>} Sorted results
 */
export function performLookup(sources, queryEmbedding, options = {}) {
  const {
    limit = 20,
    skipBlocks = false,
    excludeKeys = []
  } = options;

  // Validate query embedding
  if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
    throw new Error('Invalid query embedding: must be an array of numbers');
  }

  const results = [];
  const candidateLimit = limit * 3; // Get more candidates for better filtering

  for (const [key, source] of Object.entries(sources)) {
    // Skip excluded keys
    if (excludeKeys.includes(key)) continue;

    // Skip blocks if requested (blocks have # in their key)
    if (skipBlocks && key.includes('#')) continue;

    // Skip items without embeddings
    if (!source.vec || !Array.isArray(source.vec)) continue;

    // Skip if embedding dimensions don't match
    if (source.vec.length !== queryEmbedding.length) {
      console.warn(`Skipping ${key}: embedding dimension mismatch (${source.vec.length} vs ${queryEmbedding.length})`);
      continue;
    }

    const score = cosineSimilarity(queryEmbedding, source.vec);

    results.push({
      item: source,
      score: score,
      originalKey: key
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Apply candidate limit before consolidation
  const candidates = results.slice(0, candidateLimit);

  // Consolidate results by rolling up to level-1 headings and dedup
  const consolidatedResults = consolidateResults(candidates);

  // Apply final limit
  return consolidatedResults.slice(0, limit);
}

/**
 * Consolidate results by rolling up to level-1 headings and deduplicating
 * Reuses the same logic as search.js for consistency
 * @param {Array} results - Raw search results with originalKey
 * @returns {Array} Consolidated results
 */
function consolidateResults(results) {
  const seen = new Map();
  const consolidated = [];

  for (const result of results) {
    const key = result.originalKey;
    const basePath = key.split('#')[0];

    // Determine the consolidation key:
    // - For files without #, use the full path
    // - For files with #, roll up to level-1 heading (first #)
    const consolidateKey = key.includes('#')
      ? `${basePath}#${key.split('#').slice(1, 2).join('#')}`
      : key;

    // Extract heading level if present
    const headingMatch = key.match(/#(#+)(.+)$/);
    const hasSubheading = headingMatch && headingMatch[1].length > 1; // ## or deeper

    // Skip if we already have a better result
    if (seen.has(consolidateKey)) {
      const existing = consolidated[seen.get(consolidateKey)];
      // Keep the higher scoring result
      if (result.score > existing.score) {
        consolidated[seen.get(consolidateKey)] = result;
      }
      continue;
    }

    // Only add if it's not a subheading of something we already have
    if (hasSubheading) {
      const parentKey = `${basePath}#${headingMatch[2].trim()}`;
      if (seen.has(parentKey)) {
        continue; // Skip subheading since we have the parent
      }
    }

    seen.set(consolidateKey, consolidated.length);
    consolidated.push(result);
  }

  return consolidated;
}

/**
 * Perform lookup with plugin settings filters applied
 * @param {Object} sources - All smart sources
 * @param {Array<number>} queryEmbedding - Query embedding vector
 * @param {Object} settings - Plugin settings for filtering
 * @param {Object} options - Lookup options
 * @returns {Array<{item: Object, score: number}>} Filtered results
 */
export function performLookupWithFilters(sources, queryEmbedding, settings, options = {}) {
  // Perform basic lookup
  let results = performLookup(sources, queryEmbedding, options);

  // Apply exclusion filters if settings are available
  if (settings && typeof settings === 'object') {
    results = applyExclusionFilters(results, settings);
  }

  return results;
}

/**
 * Validate query and prepare for lookup
 * @param {string} query - Query string to embed and search
 * @returns {string} Validated and cleaned query
 */
export function validateAndPrepareQuery(query) {
  if (!query || typeof query !== 'string') {
    throw new Error('Query must be a non-empty string');
  }

  const trimmedQuery = query.trim();

  if (trimmedQuery.length === 0) {
    throw new Error('Query cannot be empty or whitespace');
  }

  if (trimmedQuery.length > 2000) {
    throw new Error('Query too long (max 2000 characters). Consider using a shorter query.');
  }

  return trimmedQuery;
}

/**
 * Get lookup statistics
 * @param {Object} sources - All smart sources
 * @returns {Object} Statistics about available sources
 */
export function getLookupStatistics(sources) {
  const stats = {
    totalSources: Object.keys(sources).length,
    sourcesWithEmbeddings: 0,
    blockLevelSources: 0,
    fileLevelSources: 0,
    averageEmbeddingDimension: 0
  };

  let totalDimensions = 0;
  let dimensionCount = 0;

  for (const [key, source] of Object.entries(sources)) {
    if (source.vec && Array.isArray(source.vec)) {
      stats.sourcesWithEmbeddings++;

      if (key.includes('#')) {
        stats.blockLevelSources++;
      } else {
        stats.fileLevelSources++;
      }

      totalDimensions += source.vec.length;
      dimensionCount++;
    }
  }

  if (dimensionCount > 0) {
    stats.averageEmbeddingDimension = Math.round(totalDimensions / dimensionCount);
  }

  return stats;
}