'use strict';
const { cosineSimilarity } = require('./recall-cache-store');
const { Bm25Index } = require('./bm25');
class RecallIndex {
  constructor(options = {}) { this.embeddingWeight = options.embeddingWeight ?? 0.8; this.items = []; this.bm25 = new Bm25Index(); }
  rebuild(items) { this.items = items.slice(); this.bm25.build(this.items); }
  upsert(item) { const index = this.items.findIndex((value) => value.id === item.id); if (index >= 0) this.items[index] = item; else this.items.push(item); this.bm25.build(this.items); }
  size() { return this.items.length; }
  search(queryVector, queryText, topK = 10) { const bm25 = Bm25Index.normalize(this.bm25.score(queryText)); const useEmbedding = Array.isArray(queryVector) && queryVector.length > 0; return this.items.map((item) => { const cosine = useEmbedding ? Math.max(0, cosineSimilarity(queryVector, item.vector || [])) : 0; const lexical = bm25.get(item.id) || 0; return { id: item.id, score: useEmbedding ? this.embeddingWeight * cosine + (1 - this.embeddingWeight) * lexical : lexical, cosine, bm25: lexical, status: item.status }; }).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, topK); }
}
module.exports = Object.freeze({ RecallIndex });
