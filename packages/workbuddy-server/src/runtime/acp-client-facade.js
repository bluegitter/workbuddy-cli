'use strict';

// Compatibility facade for callers that still import the runtime boundary.
const { WorkbuddyACPClient } = require('./workbuddy-acp-client');
const factory = require('../agent/acp-client');
module.exports = Object.freeze({ ...factory, WorkbuddyACPClient });
