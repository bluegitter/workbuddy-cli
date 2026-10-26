'use strict';

// Migration services are being moved out of workbuddy-server incrementally.
// This package is the stable public boundary during that transition.
module.exports = Object.freeze({
  packageName: '@workbuddy/history-migration',
  ...require('../../workbuddy-server/src/migration/automation-migration'),
  ...require('../../workbuddy-server/src/migration/claw-settings-migration'),
  ...require('../../workbuddy-server/src/migration/legacy-todos-migration'),
  ...require('../../workbuddy-server/src/migration/plan-migration')
});
