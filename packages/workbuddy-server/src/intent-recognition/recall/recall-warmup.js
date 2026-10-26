'use strict';
const crypto = require('node:crypto');
const { decodeEmbeddingBase64 } = require('./recall-cache-store');
const BATCH_SIZE = 16;
const MAX_TEXT_LEN = 1000;
class RecallWarmup {
  constructor(deps) { this.deps = deps; this.logger = deps.logger ?? console; }
  async warmupKind(kind, index) {
    const candidates = await this.deps.fetchCandidates(kind); const report = { kind, total: 0, cacheHits: 0, fetched: 0, failed: 0 };
    if (candidates === null) { report.skipped = true; return report; }
    report.total = candidates.length;
    if (!candidates.length) { index.rebuild([]); await this.deps.cache.cleanupStale(kind, new Set()); return report; }
    const validHashes = new Set(); const misses = []; const hits = [];
    for (const candidate of candidates) { const text = candidate.text.length > MAX_TEXT_LEN ? candidate.text.slice(0, MAX_TEXT_LEN) : candidate.text; const hash = crypto.createHash('sha1').update(this.deps.model).update('\n').update(text).digest('hex'); validHashes.add(hash); const cached = await this.deps.cache.get(kind, hash); if (cached) { hits.push({ id: candidate.id, text, vector: decodeEmbeddingBase64(cached.embeddingBase64), status: candidate.status }); report.cacheHits += 1; } else misses.push({ candidate, hash, text }); }
    index.rebuild(hits);
    for (let i = 0; i < misses.length; i += BATCH_SIZE) { const batch = misses.slice(i, i + BATCH_SIZE); try { const result = await this.deps.rateLimiter.schedule(() => this.deps.embedder.embed({ texts: batch.map((item) => item.text), model: this.deps.model })); for (let j = 0; j < batch.length; j += 1) { const item = batch[j]; const embedding = result.embeddings[j]; try { await this.deps.cache.set(kind, item.hash, { id: item.candidate.id, text: item.text, embeddingBase64: embedding.base64, model: result.model, createdAt: new Date().toISOString() }); } catch (error) { this.logger.warn?.(`[RecallWarmup] cache write failed for ${kind}/${item.candidate.id}:`, String(error)); } index.upsert({ id: item.candidate.id, text: item.text, vector: embedding.vector, status: item.candidate.status }); report.fetched += 1; } } catch (error) { report.failed += batch.length; this.logger.warn?.(`[RecallWarmup] embed batch failed (kind=${kind}, batchStart=${i}):`, String(error)); } }
    try { await this.deps.cache.cleanupStale(kind, validHashes); } catch (error) { this.logger.warn?.(`[RecallWarmup] cleanupStale ${kind} failed:`, String(error)); }
    return report;
  }
}
module.exports = Object.freeze({ RecallWarmup, BATCH_SIZE, MAX_TEXT_LEN });
