/**
 * Boundary for the recovered WorkBuddy workbuddy-core package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/workbuddy-core",
  artifactRoot: __dirname + "/compiled",
  ...require("./runtime/invariant"),
  ...require("./runtime/serialization"),
});
