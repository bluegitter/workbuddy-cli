'use strict';

function resolveChannel(method, resolver) {
  const channel = resolver?.(method);
  return channel === undefined ? method : channel;
}

function handleRpc(registry, method, handler, resolver) {
  registry.handle(resolveChannel(method, resolver), handler);
}

function handleRpcAlias(registry, channel, _method, handler) {
  registry.handle(channel, handler);
}

function pushRpcEvent(publisher, method, payload, resolver) {
  publisher.push(resolveChannel(method, resolver), payload);
}

module.exports = Object.freeze({ handleRpc, handleRpcAlias, pushRpcEvent });
