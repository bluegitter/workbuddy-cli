'use strict';

// The SDK owns the Web Standard and Node.js Streamable HTTP transports.  Keep
// this file as the stable WorkBuddy import boundary while avoiding a second
// copy of the transport implementation in the bundle.
module.exports = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
