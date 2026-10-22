'use strict';

// Compatibility export while callers migrate to @workbuddy/context.
module.exports = {
  ...require('../../../context/src/runtime/context-builder'),
  ...require('../../../context/src/runtime/context-window'),
};
