# Obsidian Smart Connections Plugin - Smart Lookup Implementation Reference

## Overview

This document provides a comprehensive reference implementation of the "Smart Lookup" functionality from the obsidian-smart-connections plugin. The implementation demonstrates semantic search capabilities using query embeddings to find conceptually related content.

## Architecture

### Core Components

#### 1. Lookup Component (`src/components/lookup.js`)

The main lookup component handles query processing and result rendering:

```javascript
export const get_lookup_params = (query, settings, filter) => {
  const skip_blocks = settings.smart_view_filter?.exclude_blocks_from_source_connections;
  return {
    hypotheticals: [query],
    filter,
    ...(skip_blocks ? { skip_blocks: true } : {}),
  };
};

export const lookup = async (sources, params) => {
  // Core lookup implementation using semantic search
  // Returns array of results sorted by similarity score
};
```

#### 2. Smart Lookup View (`src/views/sc_lookup.obsidian.js`)

```javascript
export class ScLookupView extends SmartObsidianView {
  static get view_type() { return "smart-lookup-view"; }
  static get display_text() { return "Smart Lookup"; }
  static get icon_name() { return "search"; }

  async render_view(query='', container=this.container) {
    container.empty();
    container.createEl('span', {text: 'Loading lookup...'});
    const frag = await this.env.render_component('lookup', this.env.smart_sources, {
      attribution: this.attribution,
      query,
    });
    if(container) {
      container.empty();
      container.appendChild(frag);
    }
  }
}
```

### HTML Structure

The lookup interface consists of:

```html
<div class="sc-lookup-container">
  <!-- Fold/Unfold Toggle -->
  <div class="sc-fold-toggle">
    <button class="sc-toggle-btn" title="Fold/Unfold all results">
      <svg><!-- Arrow icon --></svg>
    </button>
  </div>

  <!-- Search Input Area -->
  <div class="sc-query-container">
    <textarea
      class="sc-query-input"
      placeholder="PKM strategies, story elements, personal AI alignment..."
      rows="3"
    ></textarea>
    <button class="sc-search-btn">Search</button>
  </div>

  <!-- Results Container -->
  <div class="sc-results-container">
    <!-- Results dynamically inserted here -->
  </div>
</div>
```

## Query Processing

### Embedding Model Configuration

The system uses transformer-based embeddings configured in `smart_env.config.js`:

```javascript
smart_sources: {
  min_chars: 200,
  embed_model: {
    adapter: "transformers",
    transformers: {
      legacy_transformers: false,
      model_key: 'TaylorAI/bge-micro-v2', // Default model
    },
    "TaylorAI/bge-micro-v2": {},
    "Xenova/jina-embeddings-v2-base-zh": {}, // Alternative models
  },
}
```

### Query Embedding Flow

1. **Input Processing**: Query text is received from user input
2. **Token Validation**: Query is checked against model's token limits
3. **Embedding Generation**: Query is converted to vector representation
4. **Similarity Search**: Vector compared against pre-embedded document vectors
5. **Result Ranking**: Results sorted by cosine similarity score

```javascript
// Example embedding process
async function embedQuery(query) {
  // Token counting
  const tokens = await tokenizer(query);

  // Truncate if needed
  if (tokens > model.max_tokens) {
    query = truncateText(query, model.max_tokens);
  }

  // Generate embedding
  const embedding = await pipeline(query, {
    pooling: 'mean',
    normalize: true
  });

  return Array.from(embedding.data);
}
```

## User Interface Components

### Interactive Features

1. **Debounced Auto-Search**: Automatically searches 500ms after user stops typing
2. **Manual Search**: Click button to trigger immediate search
3. **Fold/Unfold**: Toggle expanded/collapsed view of all results
4. **Real-time Updates**: Results update dynamically as user types

### Event Handling

```javascript
class LookupInterface {
  constructor(container, env) {
    this.container = container;
    this.env = env;
    this.debounceTimer = null;

    this.setupEventListeners();
  }

  setupEventListeners() {
    const input = this.container.querySelector('.sc-query-input');
    const searchBtn = this.container.querySelector('.sc-search-btn');

    // Debounced input handler
    input.addEventListener('input', (e) => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.performSearch(e.target.value);
      }, 500);
    });

    // Manual search
    searchBtn.addEventListener('click', () => {
      this.performSearch(input.value);
    });

    // Enter key handling
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.performSearch(input.value);
      }
    });
  }

  async performSearch(query) {
    if (!query.trim()) return;

    // Generate lookup parameters
    const params = get_lookup_params(query, this.env.settings);

    // Perform semantic search
    const results = await this.env.smart_sources.lookup(params);

    // Render results
    await this.renderResults(results);
  }
}
```

## Result Processing and Display

### Results Container (`src/components/connections_results.js`)

```javascript
export async function render(results, opts = {}) {
  if(!results || !Array.isArray(results) || results.length === 0) {
    const no_results = this.create_doc_fragment(`
      <p class="sc-no-results">
        No results found.<br>
        <em>Try using the refresh button. If that doesn't work, try running
        "Clear sources data" and then "Reload sources" in the Smart Environment settings.</em>
      </p>
    `);
    return no_results;
  }

  const result_frags = await Promise.all(results.map(result => {
    return result.item.env.render_component('connections_result', result, {...opts});
  }));

  const fragment = this.create_doc_fragment();
  result_frags.forEach(frag => fragment.appendChild(frag));

  return fragment;
}
```

### Individual Result Component (`src/components/connections_result.js`)

```javascript
export class ConnectionsResult {
  render(result, opts = {}) {
    const { item, score } = result;

    // Result container with similarity score
    const container = this.create_doc_fragment();

    const resultEl = container.createEl('div', {
      cls: 'sc-result',
      attr: { 'data-score': score.toFixed(3) }
    });

    // Header with score and path
    const header = resultEl.createEl('div', { cls: 'sc-result-header' });
    header.createEl('span', {
      cls: 'sc-result-score',
      text: `[${score.toFixed(2)}]`
    });

    // Breadcrumb navigation
    const breadcrumb = header.createEl('div', { cls: 'sc-result-breadcrumb' });
    this.renderBreadcrumb(item.path, breadcrumb);

    // Content area (expandable)
    const content = resultEl.createEl('div', { cls: 'sc-result-content' });

    if (opts.render_markdown) {
      await this.renderMarkdownContent(item, content);
    } else {
      content.createEl('div', { cls: 'sc-result-text', text: item.text || '' });
    }

    // Context menu
    this.addContextMenu(resultEl, item);

    return container;
  }

  renderBreadcrumb(path, container) {
    const parts = path.split('/');
    parts.forEach((part, index) => {
      if (index > 0) {
        container.createEl('span', { cls: 'sc-breadcrumb-sep', text: ' > ' });
      }
      container.createEl('span', {
        cls: 'sc-breadcrumb-part',
        text: part
      });
    });
  }
}
```

## Plugin Integration

### Command Palette Registration

```javascript
// In main plugin file (src/index.js)
register_views() {
  Object.values(this.item_views).forEach(View => {
    this.registerView(View.view_type, leaf => new View(leaf, this));

    // Add command to command palette
    this.addCommand({
      id: View.view_type,
      name: "Open: " + View.display_text + " view",
      callback: () => {
        View.open(this.app.workspace);
      }
    });

    // Dynamic accessor methods
    const method_name = View.view_type
      .replace("smart-", "")
      .replace(/-/g, "_");
    this["open_" + method_name] = () => View.open(this.app.workspace);
  });
}
```

### View Opening Method

```javascript
static async open(workspace) {
  const leaf = workspace.getLeaf(true);
  await leaf.setViewState({
    type: this.view_type,
    active: true,
  });
  workspace.revealLeaf(leaf);
}
```

### Ribbon Icon Integration

```javascript
onload() {
  // Add ribbon icon for quick access
  this.addRibbonIcon('search', 'Smart Lookup', (evt: MouseEvent) => {
    ScLookupView.open(this.app.workspace);
  });
}
```

## Settings and Configuration

### View Filter Settings

```javascript
smart_view_filter: {
  render_markdown: true,           // Enable markdown rendering
  show_full_path: false,          // Show full file paths
  exclude_blocks_from_source_connections: false,
  exclude_frontmatter_blocks: true,
  expanded_view: false,            // Default to collapsed view
  results_limit: 20,              // Maximum results per page
}
```

### Embedding Configuration

```javascript
smart_sources: {
  single_file_data_path: ".smart-env/smart_sources.json",
  min_chars: 200,                 // Minimum characters for embedding
  embed_model: {
    adapter: "transformers",
    transformers: {
      legacy_transformers: false,
      model_key: "Xenova/jina-embeddings-v2-base-zh",
    },
  },
}
```

## Search Algorithm

### Collection Lookup Method

```javascript
// In smart sources collection
async lookup(params) {
  const {
    hypotheticals,
    filter = {},
    skip_blocks = false,
    limit = 20
  } = params;

  const results = [];

  // Process each hypothetical query
  for (const query of hypotheticals) {
    // Generate embedding for query
    const queryEmbedding = await this.embedding_service.embed(query);

    // Find similar documents
    const similarities = this.findSimilarDocuments(queryEmbedding.vec);

    // Apply filters
    const filtered = this.applyFilters(similarities, filter);

    results.push(...filtered);
  }

  // Sort by similarity score and limit results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

findSimilarDocuments(queryEmbedding) {
  const similarities = [];

  for (const [key, source] of Object.entries(this.sources)) {
    if (!source.vec) continue;

    // Calculate cosine similarity
    const score = cosineSimilarity(queryEmbedding, source.vec);

    similarities.push({
      item: source,
      score,
      key
    });
  }

  return similarities;
}
```

## Performance Optimizations

### Model Loading and Caching

```javascript
class EmbeddingService {
  constructor(modelConfig) {
    this.modelConfig = modelConfig;
    this.pipeline = null;
    this.isLoaded = false;
  }

  async loadModel() {
    if (this.isLoaded) return;

    this.pipeline = await pipeline(
      'feature-extraction',
      this.modelConfig.model_key,
      {
        quantized: true,  // Use quantized models for faster loading
        device: 'webgpu' // Use GPU if available
      }
    );

    this.isLoaded = true;
  }

  async embed(text) {
    await this.loadModel();

    return await this.pipeline(text, {
      pooling: 'mean',
      normalize: true
    });
  }
}
```

### Debouncing and Throttling

```javascript
class SearchManager {
  constructor() {
    this.searchQueue = [];
    this.isSearching = false;
  }

  async scheduleSearch(query) {
    // Cancel previous search
    this.searchQueue = [];
    this.searchQueue.push(query);

    if (!this.isSearching) {
      await this.processQueue();
    }
  }

  async processQueue() {
    this.isSearching = true;

    while (this.searchQueue.length > 0) {
      const query = this.searchQueue.shift();
      await this.performSearch(query);
    }

    this.isSearching = false;
  }
}
```

## Mobile Optimization

```javascript
// Prevent loading on mobile devices to avoid performance issues
if (Platform.isMobile) {
  // Defer embedding loading until user explicitly triggers
  this.deferModelLoading = true;
} else {
  // Pre-load models on desktop
  this.initializeEmbeddingService();
}
```

## Error Handling

```javascript
async performSearch(query) {
  try {
    const params = get_lookup_params(query, this.settings);
    const results = await this.smart_sources.lookup(params);
    await this.renderResults(results);
  } catch (error) {
    console.error('Search failed:', error);

    // Show user-friendly error message
    this.showError(`
      Search failed: ${error.message}<br>
      <em>Please check your model configuration and try again.</em>
    `);
  }
}

showError(message) {
  const container = this.container.querySelector('.sc-results-container');
  container.innerHTML = `
    <div class="sc-error">
      <p>${message}</p>
      <button class="sc-retry-btn">Retry</button>
    </div>
  `;

  container.querySelector('.sc-retry-btn')
    .addEventListener('click', () => this.performSearch(this.lastQuery));
}
```

## Complete Flow Summary

1. **Initialization**: Plugin loads and registers Smart Lookup view and commands
2. **User Interaction**: User opens lookup view and types query
3. **Debounced Search**: Query processed after 500ms delay or manual trigger
4. **Embedding**: Query converted to vector using configured transformer model
5. **Similarity Search**: Vector compared against pre-embedded document vectors
6. **Result Processing**: Results filtered, ranked, and formatted
7. **UI Rendering**: Results displayed with similarity scores and expandable content
8. **User Actions**: Results can be expanded, opened, hidden, or dragged

This implementation provides a sophisticated semantic search capability that goes beyond traditional keyword matching, enabling users to find conceptually related content based on meaning rather than exact text matches.