/**
 * Boundary for the recovered WorkBuddy workbuddy-app package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/workbuddy-app",
  artifactRoot: __dirname + "/compiled",
});
