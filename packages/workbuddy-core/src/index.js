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
  ...require("./runtime/async-utils"),
  ...require("./runtime/schema-helpers"),
  ...require("./runtime/event"),
  ...require("./runtime/emitter"),
  ...require("./runtime/disposable"),
  ...require("./runtime/promise-util"),
});
