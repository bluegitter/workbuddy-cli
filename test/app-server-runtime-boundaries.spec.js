'use strict';
const assert = require('node:assert');
const { createWorkbuddyAppServerServices, createNoopWorkbuddyAppServerWindowManager, readBooleanEnv } = require('../packages/workbuddy-server/src');
async function main() { const services = createWorkbuddyAppServerServices({ docsService: {}, moderationService: {}, sessionPersistence: {} }); assert.deepStrictEqual(Object.keys(services), ['docsService', 'identityServiceRef', 'moderationService', 'sessionPersistence']); process.env.WB_BOUNDARY_BOOL = 'yes'; assert.strictEqual(readBooleanEnv('WB_BOUNDARY_BOOL'), true); process.env.WB_BOUNDARY_BOOL = 'no'; assert.strictEqual(readBooleanEnv('WB_BOUNDARY_BOOL'), false); delete process.env.WB_BOUNDARY_BOOL; assert.equal(typeof createNoopWorkbuddyAppServerWindowManager().broadcast, 'function'); console.log('app server boundary tests passed'); }
main().catch((error) => { console.error(error); process.exitCode = 1; });
