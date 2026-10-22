/**
 * Boundary for the recovered WorkBuddy context package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/context",
  artifactRoot: __dirname + "/compiled",
});
