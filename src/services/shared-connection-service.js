import path from 'path';
import fs from 'fs';
import { loadSmartSources, getSource } from '../core/data-loader.js';
import { loadPluginSettings } from '../core/config-loader.js';
import { findConnections, applyExclusionFilters } from '../core/search.js';
import { resolveNotePath } from '../utils/path-resolver.js';

/**
 * Shared connection service that can be used by both CLI and MCP server
 * Provides connection finding functionality for semantic note similarity
 */
export class SharedConnectionService {
  constructor(vaultPath, options = {}) {
    this.vaultPath = vaultPath;
    this.options = {
      verbose: false,
      ...options
    };
    this.sources = null;
    this.settings = null;
    this.initialized = false;
    this.realVaultPath = null; // Will store the resolved absolute path
  }

  /**
   * Initialize the service by loading data
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    if (this.options.verbose) {
      console.log('Loading smart-connections data...');
    }

    // Resolve the real vault path (handle symbolic links)
    this.realVaultPath = fs.realpathSync(this.vaultPath);

    if (this.options.verbose) {
      console.log(`Vault path: ${this.vaultPath}`);
      console.log(`Real vault path: ${this.realVaultPath}`);
    }

    // Load plugin settings and smart sources using the resolved path
    [this.settings, this.sources] = await Promise.all([
      loadPluginSettings(this.realVaultPath),
      loadSmartSources(this.realVaultPath)
    ]);

    if (Object.keys(this.sources).length === 0) {
      throw new Error('No smart sources found. Ensure smart-connections plugin has generated embeddings.');
    }

    if (this.options.verbose) {
      console.log(`Loaded ${Object.keys(this.sources).length} sources`);
    }

    this.initialized = true;
  }

  /**
   * Find connections for a given note path
   * @param {string} notePath - Path to the note file (absolute or relative to vault)
   * @param {Object} options - Connection options
   * @param {number} options.limit - Maximum number of results (default: 20)
   * @param {boolean} options.includeBlocks - Include block-level connections (default: true)
   * @returns {Promise<Array>} Connection results
   */
  async findConnections(notePath, options = {}) {
    const {
      limit = 20,
      includeBlocks = true
    } = options;

    if (!this.initialized) {
      await this.initialize();
    }

    if (this.options.verbose) {
      console.log(`Finding connections for: ${notePath}`);
      console.log(`Vault path: ${this.vaultPath}`);
      console.log(`Limit: ${limit}, Include blocks: ${includeBlocks}`);
    }

    // Normalize and resolve note path to be relative to vault
    let resolvedPath = this.normalizePath(notePath);

    if (this.options.verbose) {
      console.log(`Original path: ${notePath}`);
      console.log(`Normalized path: ${resolvedPath}`);
    }

    // Check if the source exists
    const source = getSource(this.sources, resolvedPath);
    if (!source) {
      throw new Error(`Note not found or not indexed: ${resolvedPath}`);
    }

    if (this.options.verbose) {
      console.log(`Found source: ${source.name || 'Untitled'}`);
    }

    // Find connections
    const skipBlocks = this.settings.smart_view_filter?.exclude_blocks_from_source_connections || !includeBlocks;
    let results = findConnections(this.sources, resolvedPath, {
      limit: parseInt(limit) || 20,
      skipBlocks
    });

    if (this.options.verbose) {
      console.log(`Found ${results.length} raw connections`);
    }

    // Apply exclusion filters from settings
    results = applyExclusionFilters(results, this.settings);

    if (this.options.verbose) {
      console.log(`After filtering: ${results.length} connections`);
    }

    return {
      queryNote: resolvedPath,
      querySource: source,
      connections: results,
      settings: this.settings
    };
  }

  /**
   * Normalize path to be relative to vault root
   * @param {string} notePath - Input path (absolute, relative, with .md extension, etc.)
   * @returns {string} Normalized relative path
   */
  normalizePath(notePath) {
    // Convert input path to absolute path
    let absolutePath;

    if (path.isAbsolute(notePath)) {
      absolutePath = notePath;
    } else {
      // Relative path - resolve from current working directory
      absolutePath = path.resolve(process.cwd(), notePath);
    }

    // Ensure .md extension is present (Smart Connections stores paths with .md)
    if (!absolutePath.endsWith('.md') && !absolutePath.includes('.')) {
      absolutePath += '.md';
    }

    // Validate that the file exists
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    // Resolve symbolic links for the file path to get the real absolute path
    const realAbsolutePath = fs.realpathSync(absolutePath);

    // Get relative path from real vault root using real file path
    let relativePath = path.relative(this.realVaultPath, realAbsolutePath);

    // Normalize path separators (always use forward slashes)
    relativePath = relativePath.replace(/\\/g, '/');

    // Validate that the note is actually inside the vault
    const absoluteVaultPath = path.resolve(this.realVaultPath);
    if (!realAbsolutePath.startsWith(absoluteVaultPath)) {
      throw new Error(`Note path is outside the vault: ${realAbsolutePath}`);
    }

    if (this.options.verbose) {
      console.log(`Input path: ${notePath}`);
      console.log(`Absolute path: ${absolutePath}`);
      console.log(`Real absolute path: ${realAbsolutePath}`);
      console.log(`Real vault path: ${this.realVaultPath}`);
      console.log(`Absolute vault path: ${absoluteVaultPath}`);
      console.log(`Relative to vault: ${relativePath}`);
      console.log(`File exists: ${fs.existsSync(absolutePath)}`);
    }

    return relativePath;
  }

  /**
   * Get settings for formatting
   * @returns {Object} Plugin settings
   */
  getSettings() {
    if (!this.initialized) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    return this.settings;
  }

  }

/**
 * Convenience function to find connections without creating a service instance
 * @param {string} notePath - Path to the note file
 * @param {string} vaultPath - Path to vault
 * @param {Object} options - Connection options
 * @returns {Promise<Object>} Connection results
 */
export async function findNoteConnections(notePath, vaultPath, options = {}) {
  const service = new SharedConnectionService(vaultPath, options);
  return await service.findConnections(notePath, options);
}