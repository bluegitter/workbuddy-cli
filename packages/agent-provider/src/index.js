/**
 * Boundary for the recovered WorkBuddy agent-provider package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/agent-provider",
  artifactRoot: __dirname + "/compiled",
});
