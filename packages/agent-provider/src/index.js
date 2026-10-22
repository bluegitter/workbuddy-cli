/**
 * Public boundary for the recovered agent provider. The source directory is
 * intentionally independent from the Electron extraction so it can be built,
 * tested, and replaced package-by-package.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/agent-provider",
  evidenceRoot: __dirname + "/source",
  runtimeRoot: __dirname + "/runtime",
  cliBundle: require.resolve("./source/cli-bundle.js"),
  providerRegistry: require.resolve("./source/provider-registry.js"),
  ...require("./runtime/agent-loop"),
  ...require("./runtime/agent-session"),
  ...require("./runtime/context-builder"),
  ...require("./runtime/hook-registry"),
  ...require("./runtime/interruption-controller"),
  ...require("./runtime/messages"),
  ...require("./runtime/permission-controller"),
  ...require("./runtime/session-manager"),
  ...require("./runtime/session-activity"),
  ...require("./runtime/subagent-runner"),
  ...require("./runtime/tool-execution"),
  ...require("./runtime/tool-orchestration"),
  ...require("./runtime/tool-registry"),
  ...require("./runtime/client-session"),
  ...require("./runtime/client-session-manager"),
});
