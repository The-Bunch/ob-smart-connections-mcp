import { cosineSimilarity } from './similarity.js';

/**
 * Find connections for a given note
 * Replicates entity.find_connections() behavior from plugin with improvements
 * @param {Object} sources - All smart sources
 * @param {string} targetPath - Path to note to find connections for
 * @param {Object} options - Search options
 * @param {Array<string>} options.excludeKeys - Keys to exclude from results
 * @param {number} options.limit - Max number of results (default: 20)
 * @param {boolean} options.skipBlocks - Exclude block-level results
 * @returns {Array<{item: Object, score: number}>} Sorted results
 */
export function findConnections(sources, targetPath, options = {}) {
  const {
    excludeKeys = [],
    limit = 20,
    skipBlocks = false
  } = options;

  const targetSource = sources[targetPath];

  if (!targetSource || !targetSource.vec) {
    throw new Error(
      `Source not found or not embedded: ${targetPath}`
    );
  }

  // Get more candidates initially (3x the requested limit) for better filtering
  const candidateLimit = limit * 3;
  const results = [];

  // Get base file path without block or heading references
  const targetBasePath = targetPath.split('#')[0];

  for (const [key, source] of Object.entries(sources)) {
    // Skip self (exact match)
    if (key === targetPath) continue;

    // Skip any references from the same file (including blocks and headings)
    const keyBasePath = key.split('#')[0];
    if (keyBasePath === targetBasePath) continue;

    // Skip excluded keys
    if (excludeKeys.includes(key)) continue;

    // Skip blocks if requested (blocks have # in their key)
    if (skipBlocks && key.includes('#')) continue;

    // Skip items without embeddings
    if (!source.vec) continue;

    const score = cosineSimilarity(targetSource.vec, source.vec);

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
 * Apply exclusion filters based on plugin settings
 * @param {Array} results - Search results
 * @param {Object} settings - Plugin settings
 * @returns {Array} Filtered results
 */
export function applyExclusionFilters(results, settings) {
  const fileExclusions = (settings.smart_sources?.file_exclusions || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const folderExclusions = (settings.smart_sources?.folder_exclusions || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return results.filter(result => {
    const path = result.item.path;

    // Check file exclusions
    for (const pattern of fileExclusions) {
      if (path.includes(pattern)) return false;
    }

    // Check folder exclusions
    for (const folder of folderExclusions) {
      if (path.startsWith(folder)) return false;
    }

    return true;
  });
}
