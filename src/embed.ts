/**
 * Local embedding generation using @xenova/transformers.
 * Uses all-MiniLM-L6-v2 (384 dimensions) — no API key needed.
 */

import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

let embedder: FeatureExtractionPipeline | null = null;

/**
 * Get or initialize the embedding pipeline.
 * Downloads model on first run (~80MB), then cached locally.
 */
async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!embedder) {
    embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
  }
  return embedder;
}

/**
 * Generate a 384-dimensional embedding for the given text.
 */
export async function embed(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const output = await model(text, {
    pooling: "mean",
    normalize: true,
  });

  // Convert Tensor to plain number array
  return Array.from(output.data as Float32Array);
}

/**
 * Generate embeddings for multiple texts in a batch.
 * More efficient than calling embed() repeatedly.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const model = await getEmbedder();
  const results: number[][] = [];

  // Process in batches of 32 to manage memory
  const batchSize = 32;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const output = await model(batch, {
      pooling: "mean",
      normalize: true,
    });

    const dim = 384;
    for (let j = 0; j < batch.length; j++) {
      const start = j * dim;
      results.push(Array.from(output.data.slice(start, start + dim) as Float32Array));
    }
  }

  return results;
}
