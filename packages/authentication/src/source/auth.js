'use strict';

// Compatibility entry for the MCP OAuth client. The generated artifact used
// an unavailable zod/chunk graph; the protocol implementation now lives in a
// standalone, dependency-light runtime module.
const client = require('../runtime/oauth-client');

module.exports = Object.freeze({
  ...client,
  auth_exports: client,
  UnauthorizedError: client.UnauthorizedError,
});
