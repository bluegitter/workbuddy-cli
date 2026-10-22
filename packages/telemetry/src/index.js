/**
 * Boundary for the recovered WorkBuddy telemetry package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/telemetry",
  artifactRoot: __dirname + "/compiled",
  ...require("./runtime/event-buffer"),
  ...require("./runtime/log-sampler"),
  ...require("./runtime/structured-logger"),
  ...require("./runtime/startup-perf-exporters"),
});
