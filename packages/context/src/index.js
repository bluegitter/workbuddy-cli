module.exports = Object.freeze({
  packageName: "@workbuddy/context",
  runtimeRoot: __dirname + "/runtime",
  ...require("./runtime/context-builder"),
  ...require("./runtime/context-window"),
});
