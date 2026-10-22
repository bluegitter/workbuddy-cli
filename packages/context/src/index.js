module.exports = Object.freeze({
  packageName: "@workbuddy/context",
  runtimeRoot: __dirname + "/runtime",
  ...require("./runtime/context-builder"),
  ...require("./runtime/context-window"),
  ...require("./runtime/context-variable-manager"),
  ...require("./runtime/context-variable-names"),
});
