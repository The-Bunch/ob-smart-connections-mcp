import fs from 'fs';
import path from 'path';

/**
 * Load Smart Connections plugin settings
 * @param {string} vaultPath - Absolute path to vault root
 * @returns {Object} Plugin settings
 */
export function loadPluginSettings(vaultPath) {
  const configPath = path.join(
    vaultPath,
    '.obsidian',
    'plugins',
    'smart-connections',
    'data.json'
  );

  if (!fs.existsSync(configPath)) {
    // Return sensible defaults if plugin not configured
    return getDefaultSettings();
  }

  const rawConfig = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(rawConfig);
}

function getDefaultSettings() {
  return {
    smart_view_filter: {
      render_markdown: true,
      show_full_path: false,
      exclude_blocks_from_source_connections: false
    },
    smart_sources: {
      min_chars: 200,
      file_exclusions: 'Untitled',
      folder_exclusions: ''
    }
  };
}
