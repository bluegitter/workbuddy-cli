'use strict';

const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { ClawService } = require('../packages/workbuddy-server/src/claw/claw-service');

const settingsPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'claw-service-')), 'settings.json');
const authenticationManager = { currentSessionSubject: { getValue: () => ({ account: { uid: 'u1', enterpriseId: 'other' } }) } };
const service = new ClawService({ authenticationManager, settingsPath, productManager: { getCurrentConfiguration: () => ({ productFeatures: {} }) } });
assert.strictEqual(service.isIOAUser(), false);
assert.strictEqual(service.isChannelRestricted('wecomIOA'), true);
assert.strictEqual(service.isChannelRestricted('feishu'), false);
service.setWecomEnabled(true);
assert.strictEqual(service.getWecomEnabled(), true);
service.disableWechatmpChannel();
assert.strictEqual(service.getWechatmpEnabled(), false);
service.enableWechatmpChannel();
assert.strictEqual(service.getWechatmpEnabled(), true);
assert.deepStrictEqual(service.getSavedChannels(), ['wechatmp']);
console.log('claw service tests passed');
