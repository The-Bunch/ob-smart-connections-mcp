import fs from 'fs';
import path from 'path';

/**
 * Load smart sources data from vault
 * Supports both single-file and multi-file AJSON formats
 * @param {string} vaultPath - Absolute path to vault root
 * @returns {Object} Parsed smart sources data
 */
export function loadSmartSources(vaultPath) {
  const singleFilePath = path.join(vaultPath, '.smart-env', 'smart_sources.json');
  const multiFilePath = path.join(vaultPath, '.smart-env', 'multi');

  // Try single-file format first
  if (fs.existsSync(singleFilePath)) {
    const rawData = fs.readFileSync(singleFilePath, 'utf8');
    return JSON.parse(rawData);
  }

  // Try multi-file AJSON format
  if (fs.existsSync(multiFilePath)) {
    return loadMultiFileAJSON(multiFilePath);
  }

  throw new Error(
    'Smart sources data not found. Ensure Smart Connections plugin has indexed your vault.'
  );
}

/**
 * Load multi-file AJSON format
 * AJSON files contain comma-separated key-value pairs without outer braces
 * Format: "key1": {...}, "key2": {...}, "key3": {...},
 * @param {string} multiPath - Path to multi directory
 * @returns {Object} Merged sources data
 */
function loadMultiFileAJSON(multiPath) {
  const sources = {};
  const files = fs.readdirSync(multiPath).filter(f => f.endsWith('.ajson'));

  for (const file of files) {
    const filePath = path.join(multiPath, file);
    let content = fs.readFileSync(filePath, 'utf8').trim();

    try {
      // AJSON format: comma-separated key-value pairs without outer braces
      // Wrap in {} and remove trailing comma to make valid JSON
      if (content.endsWith(',')) {
        content = content.slice(0, -1);
      }
      content = '{' + content + '}';

      const data = JSON.parse(content);

      // Process each key-value pair
      for (const [key, value] of Object.entries(data)) {
        // Skip null or undefined values
        if (!value) continue;

        // Extract the actual path from the key
        // Keys are like "smart_sources:path/to/note.md" or "smart_blocks:path#heading"
        const actualPath = key.replace(/^(smart_sources|smart_blocks):/, '');

        // Only include items with embeddings
        const embeddings = value.embeddings || {};
        const firstModel = Object.keys(embeddings)[0];

        if (firstModel && embeddings[firstModel]?.vec) {
          sources[actualPath] = {
            ...value,
            path: actualPath,
            vec: embeddings[firstModel].vec,
            embed_model: firstModel,
            embedding_model: firstModel,
            name: value.path?.split('/').pop()?.replace('.md', '') || actualPath
          };
        }
      }
    } catch (error) {
      // Skip files that can't be parsed - this is expected for files without embeddings
    }
  }

  if (Object.keys(sources).length === 0) {
    throw new Error('No embedded sources found in multi-file format');
  }

  return sources;
}

/**
 * Get a specific source by path
 * @param {Object} sources - All sources data
 * @param {string} notePath - Path to the note (relative to vault)
 * @returns {Object|null} Source object with vec, path, etc.
 */
export function getSource(sources, notePath) {
  // Handle both absolute and relative paths
  const normalizedPath = notePath.replace(/^\/+/, '');
  return sources[normalizedPath] || null;
}
