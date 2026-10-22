/**
 * Boundary for the recovered WorkBuddy workbuddy-app package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/workbuddy-app",
  sourceRoot: __dirname + "/source",
  mainEntry: require.resolve("./source/electron-main.js"),
  preloadEntry: require.resolve("./source/preload.js"),
  ...require("./runtime/app-config"),
  ...require("./runtime/window-state"),
});
