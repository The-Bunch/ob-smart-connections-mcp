# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm start -- connection "path/to/note.md"` - Run connection command locally
- `npm start -- stats` - Run stats command locally
- `npm start -- validate` - Run validation locally
- `npm test` - Run Node.js native test runner tests
- `npm install` - Install dependencies

### CLI Usage
- `smart-cli connection "path/to/note.md" --vault=/path/to/vault` - Find semantic connections
- `smart-cli stats --vault=/path/to/vault` - Show vault statistics
- `smart-cli validate --vault=/path/to/vault` - Validate data integrity
- Use `OBSIDIAN_VAULT` environment variable or `--vault` flag to specify vault path
- `--format=json` flag available for JSON output on all commands

## Architecture

### Core Components
- **Data Loading** (`src/core/data-loader.js`) - Handles both single-file JSON and multi-file AJSON formats for Smart Connections data
- **Search Engine** (`src/core/search.js`) - Implements cosine similarity search with result consolidation and filtering
- **Similarity** (`src/core/similarity.js`) - Vector similarity calculations
- **Config Loading** (`src/core/config-loader.js`) - Loads Smart Connections plugin settings

### Data Flow
1. CLI command loads vault data from `.smart-env/` directory
2. Supports two formats: single `smart_sources.json` or multi-file `multi/*.ajson`
3. Each source contains embeddings, metadata, and file path information
4. Search uses cosine similarity to find semantically similar notes
5. Results are consolidated to roll up subheadings and deduplicate
6. Plugin settings are applied for exclusion filters

### Key Modules
- **Commands** (`src/commands/`) - Individual CLI command implementations
- **Formatters** (`src/formatters/`) - Output formatting (plaintext/JSON)
- **Utils** (`src/utils/`) - Path resolution and validation helpers

### AJSON Format
Multi-file format stores data as comma-separated key-value pairs without outer braces:
```
"key1": {...}, "key2": {...}, "key3": {...},
```
Files are processed by wrapping in `{}` and removing trailing comma to create valid JSON.

### Search Algorithm
- Uses cosine similarity between embedding vectors
- Consolidates results by rolling up to level-1 headings
- Applies exclusion filters from plugin settings
- Returns top N results with similarity scores