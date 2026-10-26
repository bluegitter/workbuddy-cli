'use strict';

const tokenCache = new Map();
const CARD_THROTTLE_MS = 100;
const STREAMING_ELEMENT_ID = 'streaming_content';
const LOADING_ICON_ELEMENT_ID = 'loading_icon';
const DEFAULT_FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis';
const DEFAULT_LARK_BASE_URL = 'https://open.larksuite.com/open-apis';

function getBaseUrl(domain, customHost) { const host = typeof customHost === 'string' ? customHost.trim() : ''; if (host) return host.replace(/\/+$/, ''); return domain === 'lark' ? DEFAULT_LARK_BASE_URL : DEFAULT_FEISHU_BASE_URL; }
function getWsOrigin(domain, customHost) { return getBaseUrl(domain, customHost).replace(/\/+open-apis\/*$/i, ''); }
async function getTenantAccessToken(credential, fetchFn = fetch) { const baseUrl = getBaseUrl(credential.domain, credential.customHost); const key = `${credential.appId}|${baseUrl}`; const cached = tokenCache.get(key); if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token; const response = await fetchFn(`${baseUrl}/auth/v3/tenant_access_token/internal`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ app_id: credential.appId, app_secret: credential.appSecret }) }); if (!response.ok) throw new Error(`Failed to get tenant_access_token: ${response.status}`); const data = await response.json(); if (data.code !== 0 || !data.tenant_access_token) throw new Error(`Feishu auth error: code=${data.code}, msg=${data.msg || 'unknown error'}`); tokenCache.set(key, { token: data.tenant_access_token, expiresAt: Date.now() + (data.expire || 7200) * 1000 }); return data.tenant_access_token; }
function optimizeMarkdownStyle(text) { return String(text || '').split('\n').map((line, index, lines) => { let value = line.replace(/^(#{1,6})\s/, (_, hashes) => hashes.length === 1 ? '#### ' : '##### '); if (index > 0 && /^\s*(\|.*\||```)/.test(value) && lines[index - 1].trim()) value = `\n${value}`; return value; }).join('\n'); }
function buildStreamingThinkingCard() { return { schema: '2.0', config: { wide_screen_mode: true, update_multi: true, streaming_mode: true }, body: { elements: [{ tag: 'markdown', content: ' ', text_align: 'left', element_id: STREAMING_ELEMENT_ID }, { tag: 'img', img_key: 'img_v3_02gp_e4231e6f-72c2-42c6-9e09-133962a2d48g', alt: { tag: 'plain_text', content: '' }, mode: 'fit_horizontal', compact_width: true, element_id: LOADING_ICON_ELEMENT_ID, preview: false }] } }; }
function buildFinalCard(text) { return { schema: '2.0', config: { wide_screen_mode: true, update_multi: true }, body: { elements: [{ tag: 'markdown', content: optimizeMarkdownStyle(text) }] } }; }
class FeishuCardStreamer {
  constructor(baseUrl, token, chatId, replyToMessageId, logger = console, replyInThread = false, fetchFn = fetch) { Object.assign(this, { baseUrl, token, chatId, replyToMessageId, logger, replyInThread, fetch: fetchFn, cardId: null, imMessageId: null, accumulatedText: '', sequence: 1, lastFlushTime: 0, flushTimer: null, completed: false }); }
  get messageId() { return this.imMessageId; }
  get created() { return this.cardId !== null; }
  async push(text) { this.accumulatedText = text; if (!this.cardId) await this.createStreamingCard(); if (this.cardId) await this.flush(); }
  async finalize(text) { this.completed = true; this.accumulatedText = text; clearTimeout(this.flushTimer); if (this.cardId) { await this.patchCardSettings(false); await this.patchCardContent(text); } }
  abort() { this.completed = true; clearTimeout(this.flushTimer); }
  async createStreamingCard() { const response = await this.fetch(`${this.baseUrl}/cardkit/v1/card/create`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, body: JSON.stringify({ type: 'card_json', data: JSON.stringify(buildStreamingThinkingCard()) }) }); const result = await response.json(); if (!response.ok || result.code !== 0) throw new Error(`CardKit create failed: ${result.msg || response.status}`); this.cardId = result.data?.card_id || null; if (!this.cardId) throw new Error('CardKit create returned no card_id'); }
  async flush() { const wait = Math.max(0, CARD_THROTTLE_MS - (Date.now() - this.lastFlushTime)); if (wait) await new Promise((resolve) => setTimeout(resolve, wait)); const response = await this.fetch(`${this.baseUrl}/cardkit/v1/card/${this.cardId}/element/${STREAMING_ELEMENT_ID}/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, body: JSON.stringify({ content: optimizeMarkdownStyle(this.accumulatedText) || ' ', sequence: ++this.sequence }) }); if (!response.ok) this.logger.warn?.('[FeishuPlugin] card flush failed', response.status); this.lastFlushTime = Date.now(); }
  async patchCardSettings(streamingMode) { return this.patch('/settings', { settings: JSON.stringify({ streaming_mode: streamingMode }) }); }
  async patchCardContent(text) { return this.patch('', { card: { type: 'card_json', data: JSON.stringify(buildFinalCard(text)) } }); }
  async patch(pathname, body) { const response = await this.fetch(`${this.baseUrl}/cardkit/v1/card/${this.cardId}${pathname}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, body: JSON.stringify({ ...body, sequence: ++this.sequence }) }); if (!response.ok) this.logger.warn?.('[FeishuPlugin] card patch failed', response.status); }
}

module.exports = { CARD_THROTTLE_MS, STREAMING_ELEMENT_ID, LOADING_ICON_ELEMENT_ID, DEFAULT_FEISHU_BASE_URL, DEFAULT_LARK_BASE_URL, getBaseUrl, getWsOrigin, getTenantAccessToken, optimizeMarkdownStyle, buildStreamingThinkingCard, buildFinalCard, FeishuCardStreamer, tokenCache };
