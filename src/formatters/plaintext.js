/**
 * Format results as human-readable plaintext
 * @param {Array} results - Search results
 * @param {Object} settings - Plugin settings for display preferences
 * @returns {string} Formatted output
 */
export function formatPlaintext(results, settings = {}) {
  if (results.length === 0) {
    return 'No connections found.';
  }

  const showFullPath = settings.smart_view_filter?.show_full_path ?? false;
  const lines = [];

  lines.push(`Found ${results.length} connection(s):\n`);

  for (const result of results) {
    const score = result.score.toFixed(2);
    const displayPath = showFullPath
      ? result.item.path
      : result.item.name || result.item.path.split('/').pop();

    lines.push(`[${score}] ${displayPath}`);
  }

  return lines.join('\n');
}
