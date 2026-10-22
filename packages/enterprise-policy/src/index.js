/**
 * Boundary for the recovered WorkBuddy enterprise-policy package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/enterprise-policy",
  artifactRoot: __dirname + "/compiled",
  ...require("./runtime/path-policy"),
  ...require("./runtime/fs-protection"),
});
