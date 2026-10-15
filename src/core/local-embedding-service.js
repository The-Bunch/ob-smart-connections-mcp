import { pipeline } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';

/**
 * Local embedding service using transformers.js
 * Generates embeddings for query strings using the same model as smart-connections
 */
export class LocalEmbeddingService {
  constructor(vaultPath, pluginSettings) {
    this.vaultPath = vaultPath;
    this.pluginSettings = pluginSettings;
    this.embeddingPipeline = null;
    this.modelId = null;
    this.dimensions = null;
  }

  /**
   * Initialize the embedding service with model detection
   */
  async initialize() {
    // Detect embedding model from existing sources
    const modelInfo = await this.detectEmbeddingModel();

    if (!modelInfo) {
      throw new Error(
        'Could not detect embedding model from smart-connections data. ' +
        'Ensure smart-connections plugin is properly configured and has generated embeddings.'
      );
    }

    this.modelId = modelInfo.modelId;
    this.dimensions = modelInfo.dimensions;

    console.log(`Loading embedding model: ${this.modelId}`);
    console.log('This may take a moment on first run...');

    try {
      // Initialize the embedding pipeline
      this.embeddingPipeline = await pipeline('feature-extraction', this.modelId, {
        // 8-bit quantised weights (onnx/model_quantized.onnx) — the same file the
        // old `quantized: true` option loaded, so query vectors stay comparable
        // with the vault's stored embeddings.
        dtype: 'q8'
      });

      console.log('Embedding model loaded successfully');
    } catch (error) {
      throw new Error(
        `Failed to load embedding model ${this.modelId}: ${error.message}\n` +
        'This might be due to insufficient memory or unsupported model format.'
      );
    }
  }

  /**
   * Detect the embedding model from smart-connections configuration
   */
  async detectEmbeddingModel() {
    const smartEnvPath = path.join(this.vaultPath, '.smart-env', 'smart_env.json');

    // First try to read from smart_env.json configuration
    if (fs.existsSync(smartEnvPath)) {
      try {
        const configContent = fs.readFileSync(smartEnvPath, 'utf8');
        const config = JSON.parse(configContent);

        // Extract model from smart_sources.embed_model.transformers.model_key
        const modelKey = config.smart_sources?.embed_model?.transformers?.model_key;
        if (modelKey) {
          console.log(`Found model configuration: ${modelKey}`);
          const modelId = this.mapModelNameToTransformers(modelKey);
          if (modelId) {
            // Determine dimensions based on model
            const dimensions = this.getModelDimensions(modelKey);
            return {
              modelId,
              modelName: modelKey,
              dimensions
            };
          }
        }
      } catch (error) {
        console.warn('Error reading smart_env.json:', error.message);
      }
    }

    // Fallback: Check embedding files for model info
    console.warn('Could not read model from config, checking embedding files...');
    return await this.detectModelFromEmbeddingFiles();
  }

  /**
   * Detect model from embedding files (fallback method)
   */
  async detectModelFromEmbeddingFiles() {
    const smartEnvPath = path.join(this.vaultPath, '.smart-env');

    // Check for single file format
    const singleFilePath = path.join(smartEnvPath, 'smart_sources.json');
    if (fs.existsSync(singleFilePath)) {
      try {
        const content = fs.readFileSync(singleFilePath, 'utf8');
        const sources = JSON.parse(content);

        // Find first source with embedding info
        for (const source of Object.values(sources)) {
          if (source.embeddings) {
            // Check embeddings object for model keys
            const embeddingModels = Object.keys(source.embeddings);
            for (const modelName of embeddingModels) {
              const modelId = this.mapModelNameToTransformers(modelName);
              if (modelId) {
                const dimensions = source.embeddings[modelName]?.vec?.length || 384;
                return {
                  modelId,
                  modelName,
                  dimensions
                };
              }
            }
          }
        }
      } catch (error) {
        console.warn('Error reading single file format:', error.message);
      }
    }

    // Check for multi-file format
    const multiFilePath = path.join(smartEnvPath, 'multi');
    if (fs.existsSync(multiFilePath)) {
      const files = fs.readdirSync(multiFilePath).filter(f => f.endsWith('.ajson'));
      for (const file of files.slice(0, 3)) { // Check first few files
        try {
          const filePath = path.join(multiFilePath, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split(',\n').filter(line => line.trim());

          for (const line of lines.slice(0, 2)) { // Check first few sources
            const sourceMatch = line.match(/"embeddings":\{"([^"]+)":/);
            if (sourceMatch) {
              const modelName = sourceMatch[1];
              const modelId = this.mapModelNameToTransformers(modelName);
              if (modelId) {
                const dimensions = this.getModelDimensions(modelName);
                return {
                  modelId,
                  modelName,
                  dimensions
                };
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    }

    // Final fallback based on typical dimension patterns
    console.warn('Could not detect model, using Jina Chinese embeddings (768-dim)');
    return {
      modelId: 'Xenova/jina-embeddings-v2-base-zh',
      modelName: 'Xenova/jina-embeddings-v2-base-zh',
      dimensions: 768
    };
  }

  /**
   * Get model dimensions based on model name
   */
  getModelDimensions(modelName) {
    if (modelName.includes('jina-embeddings-v2')) {
      return 768; // Jina v2 models typically have 768 dimensions
    }
    if (modelName.includes('bge-micro')) {
      return 384; // BGE micro has 384 dimensions
    }
    if (modelName.includes('arctic-embed-m')) {
      return 768; // Arctic medium has 768 dimensions
    }
    if (modelName.includes('MiniLM-L6-v2')) {
      return 384; // MiniLM has 384 dimensions
    }
    // Default fallback
    return 768;
  }

  /**
   * Map smart-connections model names to transformers.js model IDs
   */
  mapModelNameToTransformers(modelName) {
    const modelMap = {
      // 384-dimensional models
      'TaylorAI/bge-micro-v2': 'TaylorAI/bge-micro-v2',
      'Xenova/bge-micro-v2': 'Xenova/bge-micro-v2',
      'TaylorAI/gte-tiny': 'TaylorAI/gte-tiny',
      'Mihaiii/Ivysaur': 'Xenova/Mihaiii-Ivysaur',
      'andersonbcdefg/bge-small-4096': 'Xenova/andersonbcdefg-bge-small-4096',
      'Snowflake/snowflake-arctic-embed-xs': 'Xenova/snowflake-arctic-embed-xs',
      'Snowflake/snowflake-arctic-embed-s': 'Xenova/snowflake-arctic-embed-s',

      // 768-dimensional models
      'Snowflake/snowflake-arctic-embed-m': 'Xenova/snowflake-arctic-embed-m',
      'Xenova/all-MiniLM-L6-v2': 'Xenova/all-MiniLM-L6-v2',
      'sentence-transformers/all-MiniLM-L6-v2': 'Xenova/all-MiniLM-L6-v2',

      // Jina models (Chinese embeddings)
      'jinaai/jina-embeddings-v2-base-zh': 'Xenova/jina-embeddings-v2-base-zh',
      'jinaai/jina-embeddings-v2-base-zh-8k': 'Xenova/jina-embeddings-v2-base-zh',
      'jina-v2-base-zh-8K': 'Xenova/jina-embeddings-v2-base-zh',
      'Jina-v2-base-zh-8K': 'Xenova/jina-embeddings-v2-base-zh',
      'Jina-v2-base-zh-8K': 'Xenova/jina-embeddings-v2-base-zh'
    };

    // Direct match
    if (modelMap[modelName]) {
      return modelMap[modelName];
    }

    // Pattern matching for common models
    if (modelName.includes('bge-micro')) {
      return 'TaylorAI/bge-micro-v2';
    }

    if (modelName.includes('arctic-embed-m')) {
      return 'Xenova/snowflake-arctic-embed-m';
    }

    if (modelName.includes('MiniLM-L6-v2')) {
      return 'Xenova/all-MiniLM-L6-v2';
    }

    if (modelName.includes('jina') && modelName.includes('zh')) {
      return 'Xenova/jina-embeddings-v2-base-zh';
    }

    console.warn(`Unknown embedding model: ${modelName}, trying default 768-dim model`);
    return 'Xenova/snowflake-arctic-embed-m'; // 768-dim model
  }

  /**
   * Generate embedding for text using local model
   * @param {string} text - Text to embed
   * @returns {Object} Embedding result with vector and metadata
   */
  async generateEmbedding(text) {
    if (!this.embeddingPipeline) {
      throw new Error('Embedding service not initialized. Call initialize() first.');
    }

    try {
      // Generate embedding
      const result = await this.embeddingPipeline(text, {
        pooling: 'mean',
        normalize: true
      });

      // Convert tensor to array
      const embedding = Array.from(result.data);

      // Validate dimensions
      if (this.dimensions && embedding.length !== this.dimensions) {
        throw new Error(
          `Embedding dimension mismatch: expected ${this.dimensions}, got ${embedding.length}`
        );
      }

      return {
        vec: embedding,
        model: this.modelId,
        dimensions: embedding.length,
        text: text
      };

    } catch (error) {
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Validate model compatibility with existing embeddings
   * @param {Array} existingEmbeddings - Sample of existing embeddings
   */
  validateExactModelCompatibility(existingEmbeddings) {
    if (!existingEmbeddings || existingEmbeddings.length === 0) {
      throw new Error('No existing embeddings found for compatibility check');
    }

    const firstEmbedding = existingEmbeddings[0];
    const existingDimensions = firstEmbedding.vec?.length;

    if (!existingDimensions) {
      throw new Error('Existing embeddings are malformed');
    }

    if (this.dimensions !== existingDimensions) {
      throw new Error(
        `Model incompatibility: Local model generates ${this.dimensions} dimensions, ` +
        `but existing embeddings have ${existingDimensions} dimensions. ` +
        `Ensure smart-connections is using the same embedding model: ${this.modelId}`
      );
    }

    // Check if all existing embeddings have consistent dimensions
    for (const embedding of existingEmbeddings.slice(0, 10)) {
      if (embedding.vec?.length !== existingDimensions) {
        throw new Error('Inconsistent dimensions found in existing embeddings');
      }
    }

    return true;
  }

  /**
   * Get model information
   */
  getModelInfo() {
    return {
      modelId: this.modelId,
      dimensions: this.dimensions,
      isLoaded: !!this.embeddingPipeline
    };
  }
}