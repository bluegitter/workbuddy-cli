'use strict';

const MAX_RECONNECT_DELAY_MS = 30_000;
const DEDUP_TTL_MS = 5 * 60_000;

class SlackConfigAdapter {
  resolveAccount(rawConfig = {}) { if (!rawConfig.botToken) throw new Error('Slack: botToken is required'); return { accountId: `slack-${rawConfig.botToken.slice(-8)}`, displayName: 'Slack Bot', credential: { botToken: rawConfig.botToken, appToken: rawConfig.appToken, connectionMode: rawConfig.connectionMode || 'socket' } }; }
}

class SlackGatewayAdapter {
  constructor(logger = console) { this.logger = logger; this.running = false; this.account = null; this.socketClient = null; this.reconnectAttempt = 0; this.reconnectTimer = null; this.dedupMap = new Map(); }
  async startAccount(account) { this.account = account; this.running = true; const { botToken, appToken } = account.credential; if (!appToken) throw new Error('App-Level Token (xapp-...) is required for Socket Mode'); await this.connectSocket(botToken, appToken); }
  async stopAccount() { this.running = false; if (this.reconnectTimer) clearTimeout(this.reconnectTimer); this.socketClient?.disconnect?.(); this.socketClient = null; this.account = null; this.onConnectionStateChange?.({ status: 'disconnected' }); }
  getConnectionState() { return !this.running ? { status: 'disconnected' } : this.socketClient ? { status: 'connected', connectedAt: this.connectedAt } : { status: 'connecting' }; }
  getAccount() { return this.account; }
  pushInboundMessage(message) { this.onInboundMessage?.(message); }
  async connectSocket(botToken, appToken) { const { SocketModeClient } = await import('@slack/socket-mode'); const client = new SocketModeClient({ appToken, logLevel: 'ERROR' }); const handler = ({ event, ack }) => { ack?.(); this.handleSlackEvent(event, botToken); }; client.on('message', handler); client.on('app_mention', handler); client.on('disconnect', () => this.scheduleReconnect(botToken, appToken)); await client.start(); this.socketClient = client; this.connectedAt = Date.now(); this.reconnectAttempt = 0; this.onConnectionStateChange?.(this.getConnectionState()); }
  scheduleReconnect(botToken, appToken) { if (!this.running || this.reconnectTimer) return; const delay = Math.min(1000 * 2 ** this.reconnectAttempt++, MAX_RECONNECT_DELAY_MS); this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connectSocket(botToken, appToken).catch((error) => this.logger.warn?.('[SlackPlugin] reconnect failed', error)); }, delay); this.reconnectTimer.unref?.(); }
  async handleSlackEvent(event, botToken) { if (!event || !['message', 'app_mention'].includes(event.type) || event.bot_id) return; const id = event.client_msg_id || event.ts || `${Date.now()}`; if (this.dedupMap.has(id)) return; this.dedupMap.set(id, Date.now() + DEDUP_TTL_MS); const text = normalizeSlackText(event.text || ''); if (!text) return; this.pushInboundMessage({ messageId: id, content: [{ type: 'text', text }], sender: { senderId: event.user || 'unknown' }, group: event.channel ? { groupId: event.channel, chatType: event.channel_type === 'im' ? 'direct' : 'channel' } : undefined, timestamp: new Date(Number(event.ts) * 1000).toISOString(), replyContext: { channel: event.channel, threadTs: event.thread_ts || event.ts, botToken } }); }
}

function normalizeSlackText(text) { return String(text).replace(/<@[^>]+>\s*/g, '').replace(/<#[^|>]+\|([^>]+)>/g, '#$1').replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '$2').replace(/<(https?:\/\/[^>]+)>/g, '$1').replace(/<![^|>]+\|([^>]+)>/g, '$1').trim(); }
function markdownToMrkdwn(text) { return String(text).replace(/^#{1,6}\s+(.+)$/gm, '*$1*').replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<$2|$1>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>').replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/~~(.+?)~~/g, '~$1~'); }
class SlackOutboundAdapter { constructor(logger = console) { this.logger = logger; } async send(message) { if (message.deliveryMode !== 'final' && !(message.deliveryMode === 'progress' && message.metadata?.state === 'exec_approval')) return { success: true }; const { channel, botToken, threadTs } = message.replyContext || {}; if (!channel || !botToken) return { success: false, error: 'Missing channel or botToken in replyContext' }; try { const { WebClient } = await import('@slack/web-api'); await new WebClient(botToken).chat.postMessage({ channel, text: markdownToMrkdwn(message.text), ...(threadTs ? { thread_ts: threadTs } : {}) }); return { success: true }; } catch (error) { return { success: false, error: error.message || 'send failed' }; } } }
function createSlackPlugin(deps = {}) { return { id: 'slack', meta: { displayName: 'Slack Bot', transport: 'sdk' }, capabilities: { sendText: true, sendMarkdown: true, sendMedia: true, interactive: false, streaming: false, groupChat: true, threading: true }, config: new SlackConfigAdapter(), gateway: new SlackGatewayAdapter(deps.logger), outbound: new SlackOutboundAdapter(deps.logger), defaultReplyPolicy: { mode: 'all' } }; }

module.exports = { SlackConfigAdapter, SlackGatewayAdapter, SlackOutboundAdapter, createSlackPlugin, normalizeSlackText, markdownToMrkdwn };
