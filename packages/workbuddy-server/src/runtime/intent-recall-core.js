'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RECALL_KIND = Object.freeze({ Skill: 'skill', Plugin: 'plugin', Connector: 'connector' });
const RECALL_KINDS_ALL = Object.freeze(Object.values(RECALL_KIND));
const SKILL_NAME_ALLOWLIST = new Set(['3D模型与视频特效', 'cloudstudio-deploy', 'expert-manager']);
const PLUGIN_NAME_ALLOWLIST = new Set();
const CONNECTOR_ID_ALLOWLIST = new Set(['tdx-connector', 'qq-mail', 'tencent-docs', 'tmeet', 'cnb-woa', 'wecom', 'pkulaw', 'tyc-mcp', 'westock-mcp', 'lexiang', 'tencent-docs-oa', 'tapd-woa', 'iwiki-woa', 'tencent-recruitment', 'tencent-survey', 'km', 'ctrip-wendao', 'netease-mail', 'notion', 'xiaoe-cloud-cli', 'tencent-health-nges', 'github', 'cloudbase', 'yuandian-mcp', 'tencentads', 'tencent-map', 'fyopen-lawsearch']);
const SKILL_AUGMENTATIONS = Object.freeze({
  '3D模型与视频特效': { aliases: ['3D model generation', 'text to 3D', 'image to 3D', 'video FX template'], extraDescription: 'Supports text-to-3D model, image-to-3D model, and template-based image/video effects (video-fx).' },
  'cloudstudio-deploy': { aliases: ['CloudStudio 部署', '云端预览', '静态站点部署', '发布站点拿可分享链接'] },
  'expert-manager': { aliases: ['专家包运营', 'expert pack ops', 'convert to expert', 'review expert pack'] },
});
const PLUGIN_AUGMENTATIONS = Object.freeze({ weixinpay: { aliases: ['微信支付', '微信收款', 'wechat pay', 'wx pay'] } });

function isSkillAllowed(name) { return SKILL_NAME_ALLOWLIST.has(name); }
function isPluginAllowed(name) { return PLUGIN_NAME_ALLOWLIST.has(name); }
function isConnectorAllowed(id) { return CONNECTOR_ID_ALLOWLIST.has(id); }
function getCandidateAugmentation(kind, name) { return kind === 'skill' ? SKILL_AUGMENTATIONS[name] : kind === 'plugin' ? PLUGIN_AUGMENTATIONS[name] : undefined; }
function buildRecallText(kind, name, description, augmentation = getCandidateAugmentation(kind, name)) {
  const aliases = augmentation?.aliases?.length ? ` (aliases: ${augmentation.aliases.join(' / ')})` : '';
  return `${kind}: ${name}${aliases}\n${augmentation?.extraDescription ? `${description}\n${augmentation.extraDescription}` : description}`;
}

class RecallCacheStore {
  constructor(baseDir) { this.baseDir = baseDir; }
  static hashText(text) { return crypto.createHash('sha1').update(text).digest('hex'); }
  fileFor(kind, textHash) { return path.join(this.baseDir, kind, `${textHash}.json`); }
  async get(kind, textHash) { try { const value = JSON.parse(await fs.promises.readFile(this.fileFor(kind, textHash), 'utf8')); return value.embeddingBase64 && value.model ? value : undefined; } catch { return undefined; } }
  async set(kind, textHash, entry) { const file = this.fileFor(kind, textHash); await fs.promises.mkdir(path.dirname(file), { recursive: true }); const temp = `${file}.tmp`; await fs.promises.writeFile(temp, JSON.stringify(entry), 'utf8'); await fs.promises.rename(temp, file); }
  async cleanupStale(kind, validHashes) { let entries; try { entries = await fs.promises.readdir(path.join(this.baseDir, kind)); } catch { return 0; } let removed = 0; for (const name of entries) { if (!name.endsWith('.json')) continue; const hash = name.slice(0, -5); if (validHashes.has(hash)) continue; try { await fs.promises.unlink(path.join(this.baseDir, kind, name)); removed += 1; } catch {} } return removed; }
}

function decodeEmbeddingBase64(base64) { const buffer = Buffer.from(base64, 'base64'); return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4))); }
function cosineSimilarity(a, b) { if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0; let dot = 0; let na = 0; let nb = 0; for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0; }
function tokenize(text) { const result = []; const regex = /[\u4e00-\u9fff]|[A-Za-z0-9_]+/g; let match; while (text && (match = regex.exec(text))) result.push(match[0].toLowerCase()); return result; }

class Bm25Index {
  constructor(options = {}) { this.k1 = options.k1 ?? 1.5; this.b = options.b ?? .75; this.docs = []; this.df = new Map(); this.avgDocLength = 0; }
  build(docs) { this.docs = []; this.df.clear(); let total = 0; for (const doc of docs) { const tokens = tokenize(doc.text); const tf = new Map(); for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1); for (const token of new Set(tokens)) this.df.set(token, (this.df.get(token) || 0) + 1); this.docs.push({ id: doc.id, tf, length: tokens.length }); total += tokens.length; } this.avgDocLength = this.docs.length ? total / this.docs.length : 0; }
  score(query) { const result = new Map(); const queryTokens = tokenize(query); if (!queryTokens.length || !this.docs.length) return result; for (const doc of this.docs) { let score = 0; for (const token of queryTokens) { const frequency = doc.tf.get(token); if (!frequency) continue; const count = this.df.get(token) || 0; const idf = Math.log((this.docs.length - count + .5) / (count + .5) + 1); const denominator = frequency + this.k1 * (1 - this.b + this.b * (doc.length / (this.avgDocLength || 1))); score += idf * (frequency * (this.k1 + 1)) / denominator; } if (score > 0) result.set(doc.id, score); } return result; }
  static normalize(scores) { let max = 0; for (const score of scores.values()) max = Math.max(max, score); if (!max) return scores; return new Map([...scores].map(([id, score]) => [id, score / max])); }
}

class RecallIndex {
  constructor(options = {}) { this.embeddingWeight = options.embeddingWeight ?? .8; this.items = []; this.bm25 = new Bm25Index(); }
  rebuild(items) { this.items = items.slice(); this.bm25.build(this.items); }
  upsert(item) { const index = this.items.findIndex((value) => value.id === item.id); if (index >= 0) this.items[index] = item; else this.items.push(item); this.bm25.build(this.items); }
  size() { return this.items.length; }
  search(queryVector, queryText, topK = 10) { const bm25 = Bm25Index.normalize(this.bm25.score(queryText)); const useEmbedding = Array.isArray(queryVector) && queryVector.length > 0; const hits = this.items.map((item) => { const cosine = useEmbedding ? Math.max(0, cosineSimilarity(queryVector, item.vector || [])) : 0; const lexical = bm25.get(item.id) || 0; return { id: item.id, score: useEmbedding ? this.embeddingWeight * cosine + (1 - this.embeddingWeight) * lexical : lexical, cosine, bm25: lexical, status: item.status }; }).filter((hit) => hit.score > 0); return hits.sort((a, b) => b.score - a.score).slice(0, topK); }
}

class RateLimiter {
  constructor(options = {}) { this.maxConcurrent = options.maxConcurrent ?? 1; this.minIntervalMs = options.minIntervalMs ?? 500; this.running = 0; this.lastStartAt = 0; this.queue = []; }
  schedule(task) { return new Promise((resolve, reject) => { this.queue.push(async () => { this.running += 1; this.lastStartAt = Date.now(); try { resolve(await task()); } catch (error) { reject(error); } finally { this.running -= 1; this.drain(); } }); this.drain(); }); }
  drain() { while (this.running < this.maxConcurrent && this.queue.length) { const wait = this.minIntervalMs - (Date.now() - this.lastStartAt); if (wait > 0) { const timer = setTimeout(() => this.drain(), wait); timer.unref?.(); return; } this.queue.shift()(); } }
}

module.exports = Object.freeze({ RECALL_KIND, RECALL_KINDS_ALL, isSkillAllowed, isPluginAllowed, isConnectorAllowed, getCandidateAugmentation, buildRecallText, RecallCacheStore, decodeEmbeddingBase64, cosineSimilarity, tokenize, Bm25Index, RecallIndex, RateLimiter });
