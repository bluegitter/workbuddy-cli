'use strict';

let handler;
function setMcpTokenConfigHandler(next) { handler = next; }
function requestMcpTokenConfig(request) { if (!handler) { console.warn('[mcpTokenConfigBus] no host mounted, resolving null'); return Promise.resolve(null); } return new Promise((resolve) => handler(request, resolve)); }

module.exports = Object.freeze({ setMcpTokenConfigHandler, requestMcpTokenConfig });
