'use strict';

const { DaemonRpcDispatcher } = require('./rpc-dispatcher');

function createCompositeDaemonRpcConnection(remote, options = {}) {
  const dispatcher = new DaemonRpcDispatcher(options.logger);
  const eventListeners = new Set();
  const disposeRemoteEvents = remote.onEvent((channel, data) => publishLocalEvent(eventListeners, channel, data));
  return {
    handle(channel, handler) { dispatcher.handle(channel, handler); },
    hasLocalHandler(channel) { return dispatcher.has(channel); },
    async invoke(channel, ...args) { return dispatcher.has(channel) ? dispatcher.invoke(channel, ...args) : remote.invoke(channel, ...args); },
    push(channel, data) { publishLocalEvent(eventListeners, channel, data); },
    onEvent(listener) { eventListeners.add(listener); return () => eventListeners.delete(listener); },
    dispose() { disposeRemoteEvents(); eventListeners.clear(); },
  };
}
function publishLocalEvent(listeners, channel, data) { for (const listener of listeners) try { listener(channel, data); } catch {} }

module.exports = Object.freeze({ createCompositeDaemonRpcConnection, publishLocalEvent });
