'use strict';

// Renderer consumers use the same protocol contracts; transport selection is
// kept in runtime modules so this entry does not depend on generated chunks.
module.exports = Object.freeze({
  ...require('../runtime/facade'),
  ...require('../runtime/ndjson'),
  ...require('../runtime/rpc-connection'),
  ...require('../runtime/sse'),
  ...require('../runtime/stream'),
  ...require('../runtime/streamable-http'),
});
