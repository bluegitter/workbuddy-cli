/**
 * Boundary for the recovered WorkBuddy workbuddy-server package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/workbuddy-server",
  artifactRoot: __dirname + "/compiled",
  ...require("./runtime/local-server"),
});
