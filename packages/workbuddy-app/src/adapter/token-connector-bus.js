'use strict';

const listeners = new Set();
function requestTokenConfig(request) { for (const listener of [...listeners]) try { listener(request); } catch (error) { console.error('[tokenConnectorBus] listener threw:', error); } }
function subscribeTokenConfigRequest(listener) { listeners.add(listener); return () => listeners.delete(listener); }

module.exports = Object.freeze({ requestTokenConfig, subscribeTokenConfigRequest });
