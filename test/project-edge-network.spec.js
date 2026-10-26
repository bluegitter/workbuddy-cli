'use strict';
const assert = require('node:assert');
const { roleToRoleId, roleIdToRole } = require('../packages/workbuddy-server/src/project/_internal/cloud-member');
const { TodoNotFoundError, isTodoNotFoundError } = require('../packages/workbuddy-server/src/project/_internal/todo-errors');
const { registerEdgeSyncHandlers } = require('../packages/workbuddy-server/src/edge-sync/handlers');
async function main() { assert.strictEqual(roleToRoleId('admin'), 'project.owner'); assert.strictEqual(roleIdToRole('project.admin'), 'editor'); assert(isTodoNotFoundError(new TodoNotFoundError())); const handlers = new Map(); let flag = 0; const service = { getDeviceId: () => 'd', getOnlineDevices: async () => ({ devices: [{ deviceId: 'd', remoteViewFlag: 1 }] }), setRemoteViewFlag: async (_id, value) => { flag = value; } }; registerEdgeSyncHandlers({ handle: (name, fn) => handlers.set(name, fn) }, { getEdgeSyncService: () => service }); assert.deepStrictEqual(await handlers.get('edgeSync:getRemoteViewFlag')(), { flag: 1 }); assert.deepStrictEqual(await handlers.get('edgeSync:setRemoteViewFlag')(2), { success: true, flag: 2 }); assert.strictEqual(flag, 2); console.log('project edge network tests passed'); }
main().catch((error) => { console.error(error); process.exitCode = 1; });
