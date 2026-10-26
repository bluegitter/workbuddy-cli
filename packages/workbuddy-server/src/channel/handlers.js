'use strict';
function pushChannelEvent(registry, event, data) { registry.push?.('channel:event', { event, data }); }
function registerChannelHandlers(registry, deps = {}) { registry.handle('channel:callMethod', async () => ({ data: null })); registry.handle('channel:sendNotification', async () => true); registry.handle('channel:bindSession', async () => undefined); registry.handle('channel:unbindSession', async () => undefined); registry.handle('channel:emit', async (event, data) => { if (typeof event === 'string' && event) pushChannelEvent(registry, event, data); }); deps.claw?.register?.(registry); return registry; }
module.exports = Object.freeze({ pushChannelEvent, registerChannelHandlers });
