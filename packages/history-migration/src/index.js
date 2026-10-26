'use strict';

module.exports = Object.freeze({
  packageName: '@workbuddy/history-migration',
  ...require('./automation-migration'),
  ...require('./claw-settings-migration'),
  ...require('./legacy-todos-migration'),
  ...require('./plan-migration'),
  ...require('./paths')
});
