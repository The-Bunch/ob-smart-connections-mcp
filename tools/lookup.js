import path from 'path';
import { SharedLookupService } from '../src/services/shared-lookup-service.js';
import fs from 'fs';

/**
 * Smart Connections stores embeddings but NOT note text, so result.item.excerpt is
 * always undefined and every excerpt used to fall back to the title. Read the note
 * from disk instead and return the relevant passage.
 * For a block result ("file.md#Heading#Sub") return the text under the deepest named
 * heading; for a source result return the opening prose after any frontmatter.
 */
export function buildExcerpt(vaultRoot, relativePath, cache, maxLen = 320) {
  try {
    const hashIdx = relativePath.indexOf('#');
    const filePart = hashIdx === -1 ? relativePath : relativePath.slice(0, hashIdx);
    const trail = hashIdx === -1 ? [] : relativePath.slice(hashIdx + 1).split('#')
      .filter(seg => seg && !/^\{\d+\}$/.test(seg));
    const abs = path.join(vaultRoot, filePart);
    if (!cache.has(abs)) {
      cache.set(abs, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null);
    }
    const raw = cache.get(abs);
    if (!raw) return null;

    // strip YAML frontmatter
    let text = raw;
    if (text.startsWith('---')) {
      const end = text.indexOf('\n---', 3);
      if (end !== -1) text = text.slice(end + 4);
    }
    const lines = text.split('\n');

    let start = 0, stopLevel = 0;
    if (trail.length) {
      const target = trail[trail.length - 1].trim().toLowerCase();
      const idx = lines.findIndex(l => /^#{1,6}\s/.test(l) &&
        l.replace(/^#{1,6}\s*/, '').trim().toLowerCase() === target);
      if (idx !== -1) {
        start = idx + 1;
        stopLevel = (lines[idx].match(/^#+/) || ['#'])[0].length;
      }
    }
    const out = [];
    for (let i = start; i < lines.length; i++) {
      const l = lines[i];
      const m = l.match(/^(#{1,6})\s/);
      if (m && (stopLevel === 0 || m[1].length <= stopLevel)) {
        if (out.length) break;
        continue; // skip a leading H1 on source-level results
      }
      if (l.trim()) out.push(l.trim());
      if (out.join(' ').length >= maxLen) break;
    }
    const snippet = out.join(' ').replace(/\s+/g, ' ').trim();
    if (!snippet) return null;
    return snippet.length > maxLen ? snippet.slice(0, maxLen).replace(/\s\S*$/, '') + '…' : snippet;
  } catch {
    return null;
  }
}

export const lookupTool = {
  name: 'lookup',
  description: 'Perform semantic search using query text to find relevant notes in your Obsidian vault',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query text',
      },
      vault_path: {
        type: 'string',
        description: 'Path to Obsidian vault root (optional if OBSIDIAN_VAULT env var is set)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 20,
      },
      include_blocks: {
        type: 'boolean',
        description: 'Include block-level results in search',
        default: true,
      }
    },
    required: ['query'],
  },
  handler: async (args) => {
    const { query, vault_path: vaultPath, limit = 20, include_blocks = true } = args;

    if (!vaultPath && !process.env.OBSIDIAN_VAULT) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Vault path not specified. Provide vault_path argument or set OBSIDIAN_VAULT environment variable.',
          },
        ],
      };
    }

    try {
      const targetVaultPath = vaultPath || process.env.OBSIDIAN_VAULT;

      // Create shared lookup service with verbose disabled for MCP output
      const lookupService = new SharedLookupService(targetVaultPath, { verbose: false });

      // Perform semantic lookup
      const wanted = parseInt(limit) || 20;
      let results = await lookupService.lookup(query, {
        limit: wanted * 2 + 5,   // over-fetch: frontmatter blocks are filtered below
        skipBlocks: !include_blocks
      });

      // connections_lists.exclude_frontmatter_blocks is true in settings, but the raw
      // lookup returns '#---frontmatter---' blocks anyway. They are metadata, never the
      // useful unit of retrieval, so drop them and top up from the remaining results.
      const isFrontmatterBlock = (r) =>
        String(r.item?.path || r.originalKey || '').endsWith('#---frontmatter---');
      results = results.filter(r => !isFrontmatterBlock(r)).slice(0, wanted);

      // Format results for MCP response
      const response = {
        query,
        total_found: results.length,
        results: (() => { const fileCache = new Map(); return results.map(result => {
          // Convert relative path to absolute path for MCP response
          const relativePath = result.item.path || result.originalKey;
          const absolutePath = path.join(targetVaultPath, relativePath);
          return {
            path: absolutePath,
            title: result.item.name || 'Untitled',
            similarity: result.score,
            excerpt: result.item.excerpt
              || buildExcerpt(targetVaultPath, relativePath, fileCache)
              || 'No excerpt available',
            type: result.item.type || 'note',
          };
        }); })(),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error performing semantic lookup: ${error.message}`,
          },
        ],
      };
    }
  },
};