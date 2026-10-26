'use strict';

const { getBaseUrl, getTenantAccessToken, FeishuCardStreamer, optimizeMarkdownStyle } = require('./feishu-support');

class FeishuOutboundAdapter {
  constructor(gateway, logger = console) { this.gateway = gateway; this.logger = logger; this.streams = new Map(); }
  clearState() { for (const entry of this.streams.values()) entry.abort?.(); this.streams.clear(); }
  async send(message) {
    const account = this.gateway.getAccount(); if (!account) return { success: false, error: 'Feishu account not connected' };
    const context = message.replyContext || {}; const chatId = context.chatId; if (!chatId) return { success: false, error: 'Missing chatId in replyContext' };
    try {
      const token = await getTenantAccessToken(account.credential); const baseUrl = getBaseUrl(account.credential.domain, account.credential.customHost);
      if (message.deliveryMode === 'progress' || message.deliveryMode === 'streaming') { const key = message.streamId || chatId; let streamer = this.streams.get(key); if (!streamer) { streamer = new FeishuCardStreamer(baseUrl, token, chatId, context.messageId, this.logger); this.streams.set(key, streamer); } await streamer.push(message.text); return { success: true, messageId: streamer.messageId }; }
      const response = await fetch(`${baseUrl}/im/v1/messages?receive_id_type=chat_id`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ receive_id: chatId, msg_type: 'interactive', content: JSON.stringify({ schema: '2.0', config: { wide_screen_mode: true }, body: { elements: [{ tag: 'markdown', content: optimizeMarkdownStyle(message.text) }] } }) }) });
      if (!response.ok) throw new Error(`Feishu send failed: ${response.status}`); const data = await response.json(); return { success: data.code === 0, messageId: data.data?.message_id };
    } catch (error) { return { success: false, error: error.message || String(error) }; }
  }
}

module.exports = { FeishuOutboundAdapter };
