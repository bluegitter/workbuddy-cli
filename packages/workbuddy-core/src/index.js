/**
 * Boundary for the recovered WorkBuddy workbuddy-core package.
 * The published client is compiled; linked files in ./compiled preserve the
 * original artifact without pretending that unavailable TypeScript sources exist.
 */
module.exports = Object.freeze({
  packageName: "@workbuddy/workbuddy-core",
  artifactRoot: __dirname + "/compiled",
  ...require("./runtime/invariant"),
  ...require("./runtime/serialization"),
  ...require("./runtime/async-utils"),
  ...require("./runtime/schema-helpers"),
  ...require("./runtime/event"),
  ...require("./runtime/emitter"),
  ...require("./runtime/disposable"),
  ...require("./runtime/promise-util"),
  ...require("./runtime/language-model"),
  ...require("./runtime/auth-contract"),
  ...require("./runtime/model-catalog"),
  ...require("./sdk/version"),
  ...require("./infra/bus/event-bus"),
  ...require("./domains/config/wb"),
  ...require("./sdk/namespaces/telemetry"),
  ...require("./infra/wb-error"),
  ...require("./sdk/helpers/shape"),
  ...require("./sdk/bridge/client"),
  ...require("./infra/storage/wb"),
  ...require("./sdk/namespaces/http"),
  ...require("./sdk/namespaces/utils/feedback"),
  ...require("./sdk/namespaces/utils/swr"),
  ...require("./sdk/namespaces/utils/create"),
  ...require("./domains/connector/wb"),
  ...require("./sdk"),
});
