/**
 * Boundary for the recovered WorkBuddy plugin-core package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/plugin-core",
  artifactRoot: __dirname + "/compiled",
  ...require("./runtime/plugin-manifest"),
  ...require("./runtime/skill-loader"),
  ...require("./runtime/safe-discovery"),
  ...require("./telegram-html-utils"),
});
