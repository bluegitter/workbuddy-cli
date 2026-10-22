/**
 * Boundary for the recovered WorkBuddy authentication package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/authentication",
  artifactRoot: __dirname + "/compiled",
  ...require("./runtime/credential-store"),
  ...require("./runtime/account-context"),
  ...require("./runtime/auth-session"),
  ...require("./runtime/gateway-secret"),
  ...require("./runtime/legacy-session-migration"),
  ...require("./runtime/connector-variant"),
  ...require("./runtime/product-config"),
  ...require("./runtime/oauth-utils"),
});
