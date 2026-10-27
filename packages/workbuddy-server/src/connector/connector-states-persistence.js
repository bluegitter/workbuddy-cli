'use strict';

// Compatibility entry point for the bundle's original connector state storage
// module. The tested implementation remains in runtime until its remaining
// authentication dependencies are split into their connector package.
module.exports = require('../runtime/connector-state-persistence');
