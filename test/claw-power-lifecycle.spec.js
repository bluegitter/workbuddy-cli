'use strict';
const assert = require('node:assert');
const { ClawPowerLifecycle } = require('../packages/workbuddy-server/src/claw/claw-power-lifecycle');
async function main() { let suspend; let resume; const events = { onSuspend: (fn) => { suspend = fn; return () => {}; }, onResume: (fn) => { resume = fn; return () => {}; } }; const lifecycle = new ClawPowerLifecycle({ warn() {}, error() {} }, { getCentrifugoForceReconnect: () => undefined, getRunningGateways: () => [] }, events, { killSwitchEnv: 'WB_TEST_KILL_SWITCH' }); delete process.env.WB_TEST_KILL_SWITCH; assert.strictEqual(lifecycle.start(), true); suspend(); resume(); assert.strictEqual(lifecycle.shouldRunForceReconnect('long-poll', true).run, false); lifecycle.stop(); assert.strictEqual(lifecycle.started, false); console.log('claw power lifecycle tests passed'); }
main().catch((error) => { console.error(error); process.exitCode = 1; });
