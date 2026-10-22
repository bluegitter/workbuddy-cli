/**
 * Public boundary for the recovered agent provider. The source directory is
 * intentionally independent from the Electron extraction so it can be built,
 * tested, and replaced package-by-package.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/agent-provider",
  sourceRoot: __dirname + "/source",
  cliBundle: require.resolve("./source/cli-bundle.js"),
  providerRegistry: require.resolve("./source/provider-registry.js"),
});
