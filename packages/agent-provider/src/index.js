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
  ...require("./runtime/permission-controller"),
  ...require("./runtime/tool-execution"),
  ...require("./runtime/tool-orchestration"),
  ...require("./runtime/tool-registry"),
});
