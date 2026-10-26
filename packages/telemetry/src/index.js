/**
 * Boundary for the recovered WorkBuddy telemetry package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/telemetry",
  artifactRoot: __dirname + "/compiled",
  ...require("./common/logger/logger"),
  ...require("./runtime/prompt-trace-reporter"),
  ...require("./runtime/event-buffer"),
  ...require("./runtime/log-sampler"),
  ...require("./runtime/structured-logger"),
  ...require("./common/startup-perf/startup-perf"),
  ...require("./runtime/perf-logger"),
  ...require("./runtime/lifecycle-log"),
  ...require("./common/logger/date-range-utils"),
  ...require("./common/tracing/deterministic-id-generator"),
  ...require("./common/tracing/otel-env"),
});
