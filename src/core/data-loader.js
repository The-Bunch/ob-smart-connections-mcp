import fs from 'fs';
import path from 'path';

/**
 * Load smart sources data from vault
 *
 * Supports three on-disk formats, newest first:
 *   1. vec-index      .smart-env/smart_sources/*.ajson  + binary f32 matrices
 *                     (Smart Connections >= 4.8, `use_vec_index: true`)
 *   2. single-file    .smart-env/smart_sources.json
 *   3. multi-file     .smart-env/multi/*.ajson          (legacy, inline vectors)
 *
 * Smart Connections 4.8 stopped writing vectors inline and moved them into a
 * flat float32 matrix addressed by `embedding.default[<file>].file_i`. Vaults
 * that migrated keep the old `multi/` directory on disk, frozen at the moment
 * of migration — so preferring `multi/` silently serves a stale index. Hence
 * the ordering above: newest format wins, legacy is the fallback.
 *
 * @param {string} vaultPath - Absolute path to vault root
 * @returns {Object} Parsed smart sources data, keyed by note path
 */
export function loadSmartSources(vaultPath) {
  const smartEnvPath = path.join(vaultPath, '.smart-env');
  const vecIndexPath = path.join(smartEnvPath, 'smart_sources');
  const singleFilePath = path.join(smartEnvPath, 'smart_sources.json');
  const multiFilePath = path.join(smartEnvPath, 'multi');

  // 1. vec-index format (current)
  if (isDir(vecIndexPath)) {
    try {
      const sources = loadVecIndexFormat(smartEnvPath);
      if (Object.keys(sources).length > 0) return sources;
      warn('vec-index store found but yielded no embedded sources; falling back.');
    } catch (error) {
      warn(`vec-index store unreadable (${error.message}); falling back.`);
    }
  }

  // 2. single-file format
  if (fs.existsSync(singleFilePath)) {
    const rawData = fs.readFileSync(singleFilePath, 'utf8');
    return JSON.parse(rawData);
  }

  // 3. multi-file AJSON format (legacy)
  if (fs.existsSync(multiFilePath)) {
    return loadMultiFileAJSON(multiFilePath);
  }

  throw new Error(
    'Smart sources data not found. Ensure Smart Connections plugin has indexed your vault.'
  );
}

/* -------------------------------------------------------------------------
 * vec-index format (Smart Connections >= 4.8)
 * ---------------------------------------------------------------------- */

const DIM_CANDIDATES = [384, 512, 768, 1024, 1536, 3072];

/**
 * Load the vec-index format: AJSON metadata + external float32 matrices.
 * @param {string} smartEnvPath - Path to the .smart-env directory
 * @returns {Object} Sources keyed by note path (and block path for blocks)
 */
function loadVecIndexFormat(smartEnvPath) {
  const sourcesDir = path.join(smartEnvPath, 'smart_sources');
  const blocksDir = path.join(smartEnvPath, 'smart_blocks');

  const records = readAjsonDir(sourcesDir);
  const modelName = readModelName(smartEnvPath);
  const matrices = new Map(); // absolute matrix path -> { fd, dims, rows }

  const sources = {};

  for (const [key, value] of Object.entries(records)) {
    if (!value) continue; // tombstone: deleted source

    const notePath = value.path || key.replace(/^(smart_sources|smart_blocks):/, '');

    // --- the source-level vector ---
    const vec = resolveVector(value.embedding, sourcesDir, matrices);
    if (vec) {
      sources[notePath] = {
        ...value,
        path: notePath,
        vec,
        embed_model: modelName,
        embedding_model: modelName,
        name: notePath.split('/').pop().replace(/\.md$/, '')
      };
    }

    // --- block-level vectors ---
    const blocks = value.blocks_data;
    if (blocks && typeof blocks === 'object') {
      for (const [subKey, block] of Object.entries(blocks)) {
        if (!block || block.should_embed === false) continue;
        const bvec = resolveVector(block.embedding, blocksDir, matrices);
        if (!bvec) continue;
        const blockPath = block.key || `${notePath}${subKey}`;
        sources[blockPath] = {
          ...block,
          path: blockPath,
          vec: bvec,
          embed_model: modelName,
          embedding_model: modelName,
          name: blockPath.split('/').pop()
        };
      }
    }
  }

  for (const m of matrices.values()) {
    if (m) { try { fs.closeSync(m.fd); } catch { /* already closed */ } }
  }

  return sources;
}

/**
 * Resolve an `embedding` pointer block to an actual vector.
 * Shape: { history: [], default: { "<file>": { file, file_i, ... } } }
 */
function resolveVector(embedding, matrixDir, matrices) {
  const slots = embedding && embedding.default;
  if (!slots || typeof slots !== 'object') return null;

  for (const slot of Object.values(slots)) {
    if (!slot || typeof slot.file_i !== 'number') continue;
    const matrixPath = path.join(matrixDir, slot.file || '');
    const matrix = getMatrix(matrixPath, matrices);
    if (!matrix) continue;
    const vec = readRow(matrix, slot.file_i);
    if (vec) return vec;
  }
  return null;
}

/**
 * Open a matrix file and work out its dimensionality.
 * The file is a headerless little-endian float32 matrix; every row is one
 * unit-normalised vector. Dimensionality is inferred by finding the candidate
 * that divides the file evenly AND produces a unit-norm first row.
 */
function getMatrix(matrixPath, matrices) {
  if (matrices.has(matrixPath)) return matrices.get(matrixPath);

  let entry = null;
  try {
    const size = fs.statSync(matrixPath).size;
    const fd = fs.openSync(matrixPath, 'r');

    let dims = null;
    for (const candidate of DIM_CANDIDATES) {
      const rowBytes = candidate * 4;
      if (size % rowBytes !== 0 || size < rowBytes) continue;
      if (isUnitNorm(fd, candidate)) { dims = candidate; break; }
    }

    if (dims === null) {
      fs.closeSync(fd);
    } else {
      entry = { fd, dims, rows: size / (dims * 4) };
    }
  } catch {
    entry = null;
  }

  matrices.set(matrixPath, entry);
  return entry;
}

/** Read row 0 at a candidate dimensionality and test for unit L2 norm. */
function isUnitNorm(fd, dims) {
  const buf = Buffer.allocUnsafe(dims * 4);
  try {
    if (fs.readSync(fd, buf, 0, buf.length, 0) !== buf.length) return false;
  } catch {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < dims; i++) {
    const v = buf.readFloatLE(i * 4);
    if (!Number.isFinite(v)) return false;
    sum += v * v;
  }
  const norm = Math.sqrt(sum);
  return norm > 0.97 && norm < 1.03;
}

/** Read a single row out of an opened matrix. */
function readRow(matrix, rowIndex) {
  if (rowIndex < 0 || rowIndex >= matrix.rows) return null;
  const rowBytes = matrix.dims * 4;
  const buf = Buffer.allocUnsafe(rowBytes);
  try {
    if (fs.readSync(matrix.fd, buf, 0, rowBytes, rowIndex * rowBytes) !== rowBytes) return null;
  } catch {
    return null;
  }
  const vec = new Array(matrix.dims);
  for (let i = 0; i < matrix.dims; i++) vec[i] = buf.readFloatLE(i * 4);
  return vec;
}

/**
 * Read every *.ajson in a directory and merge them.
 * AJSON is an append-only log of `"key": {...},` lines with no outer braces;
 * later entries for a key supersede earlier ones, and `null` is a tombstone.
 */
function readAjsonDir(dir) {
  const merged = {};
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ajson'));

  for (const file of files) {
    let content = fs.readFileSync(path.join(dir, file), 'utf8').trim();
    if (!content) continue;
    if (content.endsWith(',')) content = content.slice(0, -1);
    try {
      Object.assign(merged, JSON.parse('{' + content + '}'));
    } catch {
      // Tolerate a torn final line (the plugin appends while we read).
      const cut = content.lastIndexOf(',\n');
      if (cut === -1) continue;
      try {
        Object.assign(merged, JSON.parse('{' + content.slice(0, cut) + '}'));
      } catch { /* skip unparseable file */ }
    }
  }

  return merged;
}

/** Read the configured embedding model name, for reporting. */
function readModelName(smartEnvPath) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(smartEnvPath, 'smart_env.json'), 'utf8'));
    return cfg?.smart_sources?.embed_model?.transformers?.model_key
      || cfg?.smart_sources?.embed_model?.adapter
      || 'unknown';
  } catch {
    return 'unknown';
  }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function warn(message) {
  // stdout is the MCP transport — diagnostics must go to stderr.
  console.error(`[smart-connections-mcp] ${message}`);
}

/* -------------------------------------------------------------------------
 * legacy multi-file format (Smart Connections < 4.8, inline vectors)
 * ---------------------------------------------------------------------- */

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
