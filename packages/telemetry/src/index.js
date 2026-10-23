/**
 * Boundary for the recovered WorkBuddy telemetry package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/telemetry",
  artifactRoot: __dirname + "/compiled",
  ...require("./runtime/logger"),
  ...require("./runtime/prompt-trace-reporter"),
  ...require("./runtime/event-buffer"),
  ...require("./runtime/log-sampler"),
  ...require("./runtime/structured-logger"),
  ...require("./runtime/startup-perf-exporters"),
  ...require("./runtime/perf-logger"),
  ...require("./runtime/lifecycle-log"),
  ...require("./runtime/date-range-utils"),
  ...require("./runtime/deterministic-id-generator"),
  ...require("./runtime/otel-env"),
});
