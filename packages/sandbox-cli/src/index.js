/**
 * Boundary for the recovered WorkBuddy sandbox-cli package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/sandbox-cli",
  artifactRoot: __dirname + "/compiled",
});
