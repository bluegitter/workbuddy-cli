const assert = require("node:assert/strict");
const codec = require("../packages/workbuddy-server/src/claw/plugins/yuanbao/yuanbao-codec");

assert.deepEqual(codec.CMD_TYPE, { Request: 0, Response: 1, Push: 2, PushAck: 3 });
assert.equal(codec.CMD.AuthBind, "auth-bind");
assert.equal(codec.MODULE.ConnAccess, "conn_access");

const encoded = codec.buildPingMsg("test-message");
let protobufAvailable = true;
try { require.resolve("protobufjs"); } catch { protobufAvailable = false; }

if (!protobufAvailable) {
  assert.equal(encoded, null, "codec should degrade gracefully before workspace dependencies are installed");
} else {
  assert.ok(encoded instanceof Uint8Array);
  const frame = codec.decodeConnMsg(encoded);
  assert.equal(frame.head.cmd, "ping");
  assert.equal(frame.head.msgId, "test-message");
  assert.ok(frame.data instanceof Uint8Array);
  assert.ok(codec.buildPushAck(frame.head) instanceof Uint8Array);
}

console.log("yuanbao codec tests passed");
