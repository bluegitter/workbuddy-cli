/**
 * Boundary for the recovered WorkBuddy agent-client-protocol package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/agent-client-protocol",
  sourceRoot: __dirname + "/source",
  nodeEntry: require.resolve("./source/acp.js"),
  rendererEntry: require.resolve("./source/acp-renderer.js"),
  ...require("./runtime/connection"),
  ...require("./runtime/ndjson"),
  ...require("./runtime/stream"),
  ...require("./runtime/rpc-connection"),
  ...require("./runtime/facade"),
});
