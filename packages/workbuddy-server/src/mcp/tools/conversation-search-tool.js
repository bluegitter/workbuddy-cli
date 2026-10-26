'use strict';

const crypto = require('node:crypto');

const TOOL_NAME = 'conversation_search';
const SEARCH_API_PATH = '/api/memory/search';
const SEARCH_TIMEOUT_MS = 600_000;

function hashQuery(query) { return crypto.createHash('sha256').update(query).digest('hex').slice(0, 16); }
function errorPayload(message, queryHash = '', requestId) {
  return { type: 'conversation_search_result', success: false, message, queryHash, requestId, count: 0, results: [] };
}
function textResult(payload, isError = false) { return { content: [{ type: 'text', text: JSON.stringify(payload) }], ...(isError ? { isError: true } : {}) }; }

function createConversationSearchTool({ authService, productManager, fetchFn = globalThis.fetch, isCloudMemoryEnabled } = {}) {
  return {
    name: TOOL_NAME,
    description: 'Search historical conversations for context relevant to the current task.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, start_date: { type: 'string' }, end_date: { type: 'string' }, limit: { type: 'number' } },
      required: ['query'],
    },
    handler: async (args = {}) => {
      if (isCloudMemoryEnabled?.() === false) return textResult(errorPayload('Cloud memory is disabled. conversation_search is unavailable.'), true);
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) return textResult(errorPayload('Parameter query is required and cannot be empty.'), true);
      const uid = authService?.getAccount?.()?.uid;
      if (!uid || !authService?.getToken?.()) return textResult(errorPayload('User not logged in. conversation_search is unavailable.'), true);
      const queryHash = hashQuery(query);
      const endpoint = (productManager?.getEndpoint?.() || 'https://copilot.tencent.com').replace(/\/+$/, '');
      const body = { query };
      for (const key of ['start_date', 'end_date']) if (typeof args[key] === 'string' && args[key].trim()) body[key] = args[key].trim();
      if (Number.isFinite(Number(args.limit)) && Number(args.limit) > 0) body.limit = Number(args.limit);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
      try {
        const response = await fetchFn(`${endpoint}${SEARCH_API_PATH}`, { method: 'POST', headers: { ...authService.buildAuthHeaders(true, true, false), 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
        if (!response.ok) return textResult(errorPayload(`conversation_search request failed: HTTP ${response.status}`, queryHash), true);
        const payload = await response.json();
        if (!payload || payload.code !== 0) return textResult(errorPayload(payload?.msg || 'conversation_search request failed', queryHash, payload?.requestId), true);
        const results = (Array.isArray(payload.data?.results) ? payload.data.results : []).map((item) => ({ conversation_id: item?.conversation_id || '', summary: item?.summary || '', score: typeof item?.score === 'number' ? item.score : 0, updated_at: item?.updated_at || '' }));
        return textResult({ type: 'conversation_search_result', success: true, message: 'conversation_search executed successfully.', queryHash, requestId: payload.requestId, count: payload.data?.count ?? results.length, results, time_range: payload.data?.time_range });
      } catch (error) {
        return textResult(errorPayload(error.message || String(error), queryHash), true);
      } finally { clearTimeout(timer); }
    },
  };
}

module.exports = { TOOL_NAME, SEARCH_API_PATH, SEARCH_TIMEOUT_MS, createConversationSearchTool, hashQuery, errorPayload };
