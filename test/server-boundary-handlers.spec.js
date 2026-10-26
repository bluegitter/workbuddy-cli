'use strict';
const assert = require('node:assert');
const { registerDesignAuthHandlers } = require('../packages/workbuddy-server/src/design-auth/handlers');
const { registerProjectHandlers } = require('../packages/workbuddy-server/src/project/handlers');
const { registerSchedulerHandlers } = require('../packages/workbuddy-server/src/scheduler/handlers');
const { registerLicenseRuntimeHandlers } = require('../packages/workbuddy-server/src/license/handlers');
async function main() { const handlers = new Map(); const registry = { handle: (name, fn) => handlers.set(name, fn), push() {} }; registerDesignAuthHandlers(registry, { checkConnectorStatus: async () => 'connected' }); assert.deepStrictEqual(await handlers.get('designAuth:checkSessionEntered')({ welcomeMode: 'design', sessionId: 's' }), { checked: true, status: 'authorized' }); registerProjectHandlers(registry, { service: { list: async () => ['p'] } }); assert.deepStrictEqual(await handlers.get('project:list')(), ['p']); registerSchedulerHandlers(registry, { service: { list: async () => ['t'] } }); assert.deepStrictEqual(await handlers.get('scheduler:list')(), ['t']); registerLicenseRuntimeHandlers(registry, { service: { getSnapshot: async () => ({ ok: true }) } }); assert.deepStrictEqual(await handlers.get('license:getSnapshot')(), { ok: true }); console.log('server boundary handler tests passed'); }
main().catch((error) => { console.error(error); process.exitCode = 1; });
