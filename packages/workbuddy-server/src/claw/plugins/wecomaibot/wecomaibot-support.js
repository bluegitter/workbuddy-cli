'use strict';
function resolveWsUrl(customWsUrl) { const value = customWsUrl?.trim(); return value || undefined; }
function validateCustomWsUrl(customWsUrl) { let parsed; try { parsed = new URL(customWsUrl); } catch { throw new Error(`无效的 WebSocket URL：${customWsUrl}`); } if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') throw new Error(`WebSocket URL 协议必须是 ws:// 或 wss://，当前为 ${parsed.protocol}（完整 URL：${customWsUrl}）`); }
module.exports = { resolveWsUrl, validateCustomWsUrl };
