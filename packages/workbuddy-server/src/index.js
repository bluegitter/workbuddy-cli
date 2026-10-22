/**
 * Boundary for the recovered WorkBuddy workbuddy-server package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/workbuddy-server",
  artifactRoot: __dirname + "/compiled",
  ...require("./runtime/local-server"),
  ...require("./runtime/artifact-index"),
  ...require("./runtime/automation-scheduler"),
  ...require("./runtime/mcp-registry"),
  ...require("./runtime/session-store"),
  ...require("./runtime/expert-manifest"),
  ...require("./runtime/connector-config"),
  ...require("./runtime/version-compatibility"),
  ...require("./runtime/poi-consent-registry"),
  ...require("./runtime/tool-routing"),
  ...require("./runtime/expert-cache"),
  ...require("./runtime/http-contract"),
  ...require("./runtime/client-info-provider"),
  ...require("./runtime/channel-branding"),
  ...require("./runtime/proxy-env"),
  ...require("./runtime/project-resources"),
  ...require("./runtime/edge-sync-trace"),
  ...require("./runtime/edge-sync-recovery"),
  ...require("./runtime/interaction-registries"),
  ...require("./runtime/document-paths"),
  ...require("./runtime/document-prompt"),
  ...require("./runtime/ima-errors"),
  ...require("./runtime/document-save-choices"),
});
