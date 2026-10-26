'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { WeixinApi } = require('./weixin-api');
const { WeixinMessageItemType, DEFAULT_POLL_TIMEOUT_MS } = require('./weixin-types');
const { getWorkbuddyRuntimeConfigDir } = require('../../../../../runtime/src/runtime/runtime-context');
const { chunkByBytes, stripMarkdownToPlaintext } = require('../../claw-content-utils');

const WEIXIN_TEXT_CHUNK_MAX_BYTES = 3800;

class WeixinClawBotClient {
  constructor(logger = console) { this.logger = logger; this.api = null; this.credentials = null; this.cursor = ''; this.polling = false; this.status = { status: 'disconnected' }; this.messageHandlers = new Set(); this.statusHandlers = new Set(); this.abortController = null; }
  getStatus() { return this.status; }
  onMessage(handler) { this.messageHandlers.add(handler); return { dispose: () => this.messageHandlers.delete(handler) }; }
  onStatusChange(handler) { this.statusHandlers.add(handler); return { dispose: () => this.statusHandlers.delete(handler) }; }
  setStatus(status) { this.status = status; for (const handler of this.statusHandlers) { try { handler(status); } catch {} } }
  getCursorFilePath(accountId) { return accountId ? path.join(getWorkbuddyRuntimeConfigDir(), 'claw-state', 'weixin', `${accountId.replace(/[^a-zA-Z0-9._-]/g, '_')}.cursor.json`) : undefined; }
  async loadCursor(accountId) { try { const data = JSON.parse(await fs.readFile(this.getCursorFilePath(accountId), 'utf8')); return typeof data.get_updates_buf === 'string' ? data.get_updates_buf : ''; } catch { return ''; } }
  async saveCursor(cursor) { const file = this.getCursorFilePath(this.credentials?.accountId); if (!file) return; try { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify({ get_updates_buf: cursor }), 'utf8'); } catch (error) { this.logger.warn?.('[WeixinClawBotClient] cursor persistence failed', error); } }
  async connect(credentials) { if (this.polling) return; this.credentials = credentials; this.api = new WeixinApi(credentials); this.cursor = await this.loadCursor(credentials.accountId); this.polling = true; this.setStatus({ status: 'connected', connectedAt: Date.now() }); this.pollLoop(); }
  disconnect() { this.polling = false; this.abortController?.abort(); this.abortController = null; this.api = null; this.credentials = null; this.setStatus({ status: 'disconnected' }); }
  dispose() { this.disconnect(); this.messageHandlers.clear(); this.statusHandlers.clear(); }
  forceReconnect() { this.abortController?.abort(); }
  async pollLoop() { while (this.polling && this.api) { try { this.abortController = new AbortController(); const response = await this.api.getUpdates(this.cursor, DEFAULT_POLL_TIMEOUT_MS, this.abortController.signal); if (typeof response.get_updates_buf === 'string') { this.cursor = response.get_updates_buf; await this.saveCursor(this.cursor); } for (const message of response.msgs || []) for (const handler of this.messageHandlers) await handler(message); } catch (error) { if (this.polling) { this.logger.warn?.('[WeixinClawBotClient] poll failed', error); this.setStatus({ status: 'error', error: error.message || String(error) }); await new Promise((resolve) => setTimeout(resolve, 1000)); } } finally { this.abortController = null; } } }
  async sendTextReply(context, content) { if (!this.api) throw new Error('Weixin client not connected'); for (const chunk of chunkByBytes(stripMarkdownToPlaintext(content), WEIXIN_TEXT_CHUNK_MAX_BYTES)) await this.api.sendMessage({ msg: { from_user_id: '', to_user_id: context.userId, client_id: `workbuddy-${Date.now()}`, message_type: 2, message_state: 2, context_token: context.contextToken, item_list: [{ type: WeixinMessageItemType.TEXT, text_item: { text: chunk } }] } }); }
  async sendReply(context, text) { await this.sendTextReply(context, text); }
}

module.exports = { WEIXIN_TEXT_CHUNK_MAX_BYTES, WeixinClawBotClient };
