'use strict';

const PATH_SUFFIX = '/codebase/openai/v1/embeddings';
const EMBEDDING_DEFAULT_MODEL = 'model2';

class EmbeddingClient {
  constructor(deps = {}) { this.deps = deps; }

  async embed(input) {
    const texts = input?.texts || [];
    const model = input?.model || EMBEDDING_DEFAULT_MODEL;
    if (!texts.length) return { embeddings: [], model };
    const session = this.deps.authenticationManager?.currentSessionSubject?.getValue?.();
    if (!session?.auth?.accessToken) throw new Error('embeddings: not logged in');
    const endpoint = this.deps.productManager?.getEndpoint?.();
    if (!endpoint) throw new Error('embeddings: no endpoint');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.auth.accessToken}` };
    if (session.account?.uid) headers['X-User-Id'] = session.account.uid;
    if (session.account?.enterpriseId) { headers['X-Enterprise-Id'] = session.account.enterpriseId; headers['X-Tenant-Id'] = session.account.enterpriseId; }
    if (session.auth.domain) headers['X-Domain'] = session.auth.domain;
    const response = await (this.deps.fetchFn || fetch)(`${endpoint.replace(/\/+$/, '')}${PATH_SUFFIX}`, { method: 'POST', headers, body: JSON.stringify({ model, input: texts, encoding_format: 'float' }) });
    if (!response.ok) { const text = await response.text().catch(() => ''); throw new Error(`embeddings: HTTP ${response.status} ${text.slice(0, 200)}`); }
    const json = JSON.parse(await response.text());
    const data = json.data || [];
    if (data.length !== texts.length) throw new Error(`embeddings: response size mismatch (got ${data.length}, want ${texts.length})`);
    data.sort((left, right) => left.index - right.index);
    return { embeddings: data.map((item) => ({ vector: item.embedding, base64: encodeFloatsToBase64(item.embedding) })), model: json.model || model };
  }
}

function encodeFloatsToBase64(vector) { const floats = new Float32Array(vector); return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength).toString('base64'); }

module.exports = Object.freeze({ EmbeddingClient, EMBEDDING_DEFAULT_MODEL, PATH_SUFFIX, encodeFloatsToBase64 });
