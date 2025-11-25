import path from 'path';

/**
 * Resolve note path to be relative to vault
 * @param {string} notePath - Note path (absolute or relative)
 * @param {string} vaultPath - Vault root path
 * @returns {string} Relative path
 */
export function resolveNotePath(notePath, vaultPath) {
  // If absolute path, make it relative to vault
  if (path.isAbsolute(notePath)) {
    return path.relative(vaultPath, notePath);
  }
  return notePath;
}
