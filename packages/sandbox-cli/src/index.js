/**
 * Boundary for the recovered WorkBuddy sandbox-cli package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/sandbox-cli",
  artifactRoot: __dirname + "/compiled",
  ...require("./runtime/command-policy"),
  ...require("./runtime/sandbox-runner"),
});
