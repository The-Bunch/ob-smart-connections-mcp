/**
 * Format results as JSON
 * @param {*} data - Data to format (can be results array or stats object)
 * @returns {string} JSON string
 */
export function formatJson(data) {
  // If it's an array of results, format them
  if (Array.isArray(data)) {
    const formatted = data.map(result => ({
      path: result.item.path,
      score: result.score,
      name: result.item.name,
      key: result.item.key
    }));
    return JSON.stringify(formatted, null, 2);
  }

  // Otherwise, just stringify the data as-is (for stats, etc.)
  return JSON.stringify(data, null, 2);
}
