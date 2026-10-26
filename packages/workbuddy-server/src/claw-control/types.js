'use strict';

const FAIL_OPEN_CLAW_CONTROL_SNAPSHOT = Object.freeze({ loaded: false, masterEnabled: true, channels: {} });
const CLAW_CONTROL_ON_CHANGE_CHANNEL = 'clawControl:onChange';

module.exports = Object.freeze({ FAIL_OPEN_CLAW_CONTROL_SNAPSHOT, CLAW_CONTROL_ON_CHANGE_CHANNEL });
