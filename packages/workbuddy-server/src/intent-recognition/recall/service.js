'use strict';
const { RECALL_KIND, RECALL_KINDS_ALL, SUGGESTED_KINDS } = require('./recall-cache-store');
const { RecallIndex } = require('./recall-index');
const { RateLimiter } = require('./rate-limiter');
const { RecallWarmup } = require('./recall-warmup');

const SUGGESTED_TOP_K = 3;
const PER_KIND_CANDIDATE_K = 10;
const SCORE_MIN_THRESHOLD = 0.7;
class RecallService {
  constructor(deps) {
    this.deps = deps;
    this.indexes = { [RECALL_KIND.Skill]: new RecallIndex(), [RECALL_KIND.Plugin]: new RecallIndex(), [RECALL_KIND.Connector]: new RecallIndex() };
    this.rateLimiter = deps.rateLimiter ?? new RateLimiter({ maxConcurrent: 1, minIntervalMs: 500 });
    this.logger = deps.logger ?? console;
    this.warmup = new RecallWarmup({ embedder: deps.embedder, cache: deps.cache, rateLimiter: this.rateLimiter, fetchCandidates: deps.fetchCandidates, model: deps.model, logger: this.logger });
    this.inFlight = new Map(); this.queryCache = new Map();
  }
  refresh() { for (const kind of RECALL_KINDS_ALL) this.kickWarmup(kind); }
  invalidate(kind) { this.kickWarmup(kind); }
  async invalidateAndWait(kind) { this.kickWarmup(kind); const current = this.inFlight.get(kind); if (current) await current; }
  async searchSuggested(query, topK) {
    const vector = await this.embedQuery(query); const merged = this.searchPool(SUGGESTED_KINDS, vector, query, topK > 0 ? topK : SUGGESTED_TOP_K); const result = { skills: [], plugins: [], connectors: [] };
    for (const hit of merged) { if (!hit.status) continue; const key = hit.kind === RECALL_KIND.Skill ? 'skills' : hit.kind === RECALL_KIND.Plugin ? 'plugins' : 'connectors'; result[key].push({ id: hit.id, status: hit.status }); }
    return result;
  }
  searchPool(kinds, vector, query, topK) { const hits = []; for (const kind of kinds) for (const hit of this.indexes[kind].search(vector, query, PER_KIND_CANDIDATE_K)) hits.push({ ...hit, kind }); hits.sort((a, b) => b.score - a.score); return hits.filter((hit) => hit.score >= SCORE_MIN_THRESHOLD).slice(0, topK); }
  kickWarmup(kind) { if (this.inFlight.has(kind)) return; const promise = this.warmup.warmupKind(kind, this.indexes[kind]).catch((error) => this.logger.warn?.(`[RecallService] warmup ${kind} failed:`, String(error))).finally(() => this.inFlight.delete(kind)); this.inFlight.set(kind, promise); }
  async embedQuery(query) { const trimmed = query.trim(); if (!trimmed) return undefined; if (this.queryCache.has(trimmed)) return this.queryCache.get(trimmed); try { const vector = (await this.rateLimiter.schedule(() => this.deps.embedder.embed({ texts: [trimmed], model: this.deps.model }))).embeddings[0]?.vector; if (vector) { if (this.queryCache.size >= 32) this.queryCache.delete(this.queryCache.keys().next().value); this.queryCache.set(trimmed, vector); } return vector; } catch (error) { this.logger.warn?.('[RecallService] embedQuery failed, degrade to BM25 only:', String(error)); return undefined; } }
}
module.exports = Object.freeze({ RecallService, SUGGESTED_TOP_K, PER_KIND_CANDIDATE_K, SCORE_MIN_THRESHOLD });
