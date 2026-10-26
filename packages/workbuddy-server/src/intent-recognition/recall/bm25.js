'use strict';
function tokenize(text) { const result = []; const regex = /[\u4e00-\u9fff]|[A-Za-z0-9_]+/g; let match; while (text && (match = regex.exec(text))) result.push(match[0].toLowerCase()); return result; }
class Bm25Index {
  constructor(options = {}) { this.k1 = options.k1 ?? 1.5; this.b = options.b ?? 0.75; this.docs = []; this.df = new Map(); this.avgDocLength = 0; }
  build(docs) { this.docs = []; this.df.clear(); let total = 0; for (const doc of docs) { const tokens = tokenize(doc.text); const tf = new Map(); for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1); for (const token of new Set(tokens)) this.df.set(token, (this.df.get(token) || 0) + 1); this.docs.push({ id: doc.id, tf, length: tokens.length }); total += tokens.length; } this.avgDocLength = this.docs.length ? total / this.docs.length : 0; }
  score(query) { const result = new Map(); const queryTokens = tokenize(query); if (!queryTokens.length || !this.docs.length) return result; for (const doc of this.docs) { let score = 0; for (const token of queryTokens) { const frequency = doc.tf.get(token); if (!frequency) continue; const count = this.df.get(token) || 0; const idf = Math.log((this.docs.length - count + 0.5) / (count + 0.5) + 1); const denominator = frequency + this.k1 * (1 - this.b + this.b * (doc.length / (this.avgDocLength || 1))); score += idf * frequency * (this.k1 + 1) / denominator; } if (score > 0) result.set(doc.id, score); } return result; }
  static normalize(scores) { let max = 0; for (const score of scores.values()) max = Math.max(max, score); return max ? new Map([...scores].map(([id, score]) => [id, score / max])) : scores; }
}
module.exports = Object.freeze({ tokenize, Bm25Index });
