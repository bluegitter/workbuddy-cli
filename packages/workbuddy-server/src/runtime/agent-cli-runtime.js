'use strict';

// Compatibility facade for callers that still import the pre-recovery runtime path.
module.exports = Object.freeze({
  ...require('../agent/cli-runtime-env'),
  ...require('../agent/cli-runtime-files'),
});
