# Fork notes

This is **helloBill's fork** of [`yejianye/ob-smart-connections-mcp`](https://github.com/yejianye/ob-smart-connections-mcp).
We run it as the retrieval layer over an Obsidian vault, shared by several MCP
clients. All credit for the original tool goes upstream; this fork exists to carry
three fixes we needed, and we would rather they land upstream than live here.

## Why we forked

**Smart Connections 4.8 changed its on-disk store format, and the old store is left
behind rather than removed.**

Before 4.8, embeddings were written inline in `.smart-env/multi/*.ajson`. From 4.8
(`use_vec_index: true`) the vectors move out into flat binary matrices, with metadata
in `.smart-env/smart_sources/*.ajson` pointing at them by row index.

Migration does not delete `.smart-env/multi/`. The upstream loader checks for it and
reads it if present — so on any vault that has migrated, it keeps reading the old
store, frozen at the moment of migration.

The failure mode is the dangerous kind: **no error**. `stats` reports a healthy index,
`validate` reports no issues, and `lookup` returns confident, well-scored results.
They are simply the results from a snapshot taken on migration day. Anything written
since is invisible, and nothing in the output says so. On our vault that was four days
and roughly 160 notes before anyone noticed the answers had quietly stopped moving.

## What this fork changes

**1. Read the 4.8 vec-index store** — `src/core/data-loader.js`

Preference order is now **vec-index → single-file → legacy `multi/`**, so a migrated
vault reads the live store and an un-migrated one behaves exactly as before.

The format, for anyone else debugging this: each source record carries
`embedding.default[<file>].file_i`, an index into a headerless little-endian float32
matrix stored alongside it — `smart_sources/<file>` for note vectors,
`smart_blocks/<file>` for block vectors. One row per vector, unit-normalised, no
header or padding. Block pointers hang off `blocks_data[<key>].embedding`.

Dimensionality is detected rather than assumed: a candidate must divide the file
evenly *and* yield a unit-norm row 0. Append-log tombstones (`"key": null`) and torn
final lines are tolerated, since the plugin may be writing while we read. If anything
about the new store looks wrong the loader warns on **stderr** — never stdout, which
is the MCP transport — and falls back rather than throwing.

**2. Real excerpts** — `tools/lookup.js`, `tools/connection.js`

Smart Connections stores embeddings but not note text, so `result.item.excerpt` is
always undefined and every excerpt degraded to the file name. `buildExcerpt()` reads
the note from disk and returns the passage under the deepest named heading for a block
result, or the opening prose after any frontmatter for a source result.

**3. Housekeeping** — ignore local `.bak` working files.

## Diagnosing this on your own vault

If search results feel stale but nothing errors:

```bash
ls -la .smart-env/multi | head -3          # legacy store — is its mtime frozen?
ls -la .smart-env/smart_sources            # live store — is this one current?
```

Two stores with very different timestamps means you are reading the older one. Once
this fork is in place and you have confirmed results are current, `.smart-env/multi/`
is dead weight and can go.

## Status

Running in production against a ~750-note vault (≈11k blocks, 384-dim
`TaylorAI/bge-micro-v2`): full load in ~350ms, no malformed vectors. The legacy path is
untouched and still exercised by vaults that have not migrated.

We intend to raise these upstream as a pull request. If you have hit the same thing,
the `data-loader.js` change is self-contained and should apply cleanly.

## Licence

The upstream repository carries no licence file, so all rights remain with the original
author. This is a GitHub fork under GitHub's Terms of Service and adds no licence of
its own. Please refer to upstream for any reuse beyond that.

---

Maintained by [helloBill](https://hellobill.com) (Hello Bill Limited).
