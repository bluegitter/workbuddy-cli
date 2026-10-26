'use strict';
function registerWechatChatHistoryHandlers(registry, deps = {}) { const service = deps.service ?? deps.createService?.(deps); if (!service) throw new Error('wechat chat history service is required'); registry.handle('wechatChatHistoryParseZipMetadata', (params) => service.parseZipMetadata(params)); return registry; }
module.exports = Object.freeze({ registerWechatChatHistoryHandlers });
