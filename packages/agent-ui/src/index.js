/**
 * Boundary for the recovered WorkBuddy agent-ui package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/agent-ui",
  sourceRoot: __dirname + "/source",
  rendererEntry: require.resolve("./source/renderer-entry.js"),
  ...require("./runtime/agent-view-model"),
  ...require("./runtime/todo-projection"),
  ...require("./runtime/team-runtime"),
  ...require("./runtime/share-artifacts"),
  ...require("./runtime/deep-link-coordinator"),
  ...require("./runtime/share-moderation"),
  ...require("./runtime/session-detail-state"),
  ...require("./hooks/team-runtime-history"),
  ...require("./file-tree/tree-utils"),
  ...require("./share/common/share-task-utils"),
  ...require("./share/artifact-filter"),
  ...require("./hooks/ardot-instance-cache"),
  ...require("./constants/artifact"),
  ...require("./share/moderation"),
  ...require("./utils/session-cwd-error"),
  ...require("./hooks/file-tree-watch-utils"),
  ...require("./utils/ardot-background-bootstrap"),
  ...require("./utils/session-event-routing"),
  ...require("./hooks/share-selection-helpers"),
  ...require("./utils/share/template-share/share-template-utils"),
});
