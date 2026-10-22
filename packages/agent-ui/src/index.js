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
});
