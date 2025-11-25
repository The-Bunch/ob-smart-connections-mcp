/**
 * Calculate cosine similarity between two vectors
 * Based on smart-utils/cos_sim.js implementation
 * @param {Array<number>} vecA - First embedding vector
 * @param {Array<number>} vecB - Second embedding vector
 * @returns {number} Similarity score (0-1), rounded to 3 decimal places
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

  if (magnitude === 0) return 0;

  const similarity = dotProduct / magnitude;

  // Round to 3 decimal places (matches plugin behavior)
  return Math.round(similarity * 1000) / 1000;
}
