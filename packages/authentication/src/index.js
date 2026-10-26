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
  ...require("./runtime/oauth-client"),
  ...require("./common/authentication-protocol"),
  ...require("./common/account-utils"),
  ...require("./common/product-env-service"),
  ...require("./common/default-authentication-storage"),
  ...require("./runtime/file-authentication-storage"),
  ...require("./common/custom-token-authentication-storage"),
  ...require("./runtime/oauth-cipher"),
  ...require("./runtime/connector-master-key-store"),
  ...require("./runtime/oauth-persistence"),
  ...require("./runtime/connector-oauth-store"),
  ...require("./runtime/connector-oauth-api"),
  ...require("./runtime/oauth-acl"),
  ...require("./runtime/document-edit-context"),
  ...require("./runtime/document-context-utils"),
  ...require("./runtime/tencent-docs-context-manager"),
  ...require("./runtime/product-snapshot"),
  ...require("./runtime/session-config"),
});
