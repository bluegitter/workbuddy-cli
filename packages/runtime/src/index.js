/**
 * Boundary for the recovered WorkBuddy runtime package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/runtime",
  artifactRoot: __dirname + "/compiled",
  ...require("./runtime/sidecar-manager"),
  ...require("./runtime/runtime-context"),
  ...require("./runtime/startup-context"),
  ...require("./runtime/cli-process-env"),
});
