'use strict';

// Compatibility source entry. Sidecar path policy and CLI environment policy
// are maintained as separate runtime modules.
module.exports = Object.freeze({
  ...require('../runtime/cli-process-env'),
  ...require('../runtime/sidecar-paths'),
});
