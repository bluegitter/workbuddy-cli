/**
 * Yuanbao websocket protobuf codec.
 *
 * The compiled client embeds this schema in the bundle. Keeping it as a
 * normal module makes the wire contract inspectable and independently testable.
 */
let protobuf;
let root;
let sequence = 0;

const CMD_TYPE = Object.freeze({ Request: 0, Response: 1, Push: 2, PushAck: 3 });
const CMD = Object.freeze({ AuthBind: "auth-bind", Ping: "ping", Kickout: "kickout" });
const MODULE = Object.freeze({ ConnAccess: "conn_access", YuanbaoProxy: "yuanbao_openclaw_proxy" });
const CONN_PREFIX = "trpc.yuanbao.conn_common";
const BIZ_PREFIX = "trpc.yuanbao.yuanbao_conn.yuanbao_openclaw_proxy";

const schema = { options: { syntax: "proto3" }, nested: { trpc: { nested: { yuanbao: { nested: {
  conn_common: { nested: {
    HeadMeta: { fields: { key: { type: "string", id: 1 }, value: { type: "string", id: 2 } } },
    Head: { fields: {
      cmdType: { type: "uint32", id: 1 }, cmd: { type: "string", id: 2 }, seqNo: { type: "uint32", id: 3 },
      msgId: { type: "string", id: 4 }, module: { type: "string", id: 5 }, needAck: { type: "bool", id: 6 },
      meta: { rule: "repeated", type: "HeadMeta", id: 7 }, status: { type: "int32", id: 10 }
    } },
    ConnMsg: { fields: { head: { type: "Head", id: 1 }, data: { type: "bytes", id: 2 } } },
    AuthInfo: { fields: { uid: { type: "string", id: 1 }, source: { type: "string", id: 2 }, token: { type: "string", id: 3 } } },
    DeviceInfo: { fields: {
      appVersion: { type: "string", id: 1 }, appOperationSystem: { type: "string", id: 2 },
      instanceId: { type: "string", id: 10 }, botVersion: { type: "string", id: 24 }
    } },
    AuthBindReq: { fields: {
      bizId: { type: "string", id: 1 }, authInfo: { type: "AuthInfo", id: 2 },
      deviceInfo: { type: "DeviceInfo", id: 3 }, envName: { type: "string", id: 5 }
    } },
    PingReq: { fields: {} },
    PingRsp: { fields: { heartInterval: { type: "uint32", id: 1 }, timestamp: { type: "uint64", id: 2 } } },
    KickoutMsg: { fields: { status: { type: "int32", id: 1 }, reason: { type: "string", id: 2 } } },
    PushMsg: { fields: {
      cmd: { type: "string", id: 1 }, module: { type: "string", id: 2 }, msgId: { type: "string", id: 3 }, data: { type: "bytes", id: 4 }
    } }
  } },
  yuanbao_conn: { nested: { yuanbao_openclaw_proxy: {
    ImImageInfoArray: { fields: {
      type: { type: "uint32", id: 1 }, size: { type: "uint32", id: 2 }, width: { type: "uint32", id: 3 }, height: { type: "uint32", id: 4 }, url: { type: "string", id: 5 }
    } },
    MsgContent: { fields: {
      text: { type: "string", id: 1 }, uuid: { type: "string", id: 2 }, imageFormat: { type: "uint32", id: 3 }, data: { type: "string", id: 4 }, desc: { type: "string", id: 5 }, ext: { type: "string", id: 6 }, sound: { type: "string", id: 7 }, imageInfoArray: { rule: "repeated", type: "ImImageInfoArray", id: 8 }, index: { type: "uint32", id: 9 }, url: { type: "string", id: 10 }, fileSize: { type: "uint32", id: 11 }, fileName: { type: "string", id: 12 }
    } },
    MsgBodyElement: { fields: { msgType: { type: "string", id: 1 }, msgContent: { type: "MsgContent", id: 2 } } },
    SendC2CMessageReq: { fields: {
      msgId: { type: "string", id: 1 }, toAccount: { type: "string", id: 2 }, fromAccount: { type: "string", id: 3 }, msgRandom: { type: "uint32", id: 4 }, msgBody: { rule: "repeated", type: "MsgBodyElement", id: 5 }
    } },
    SendGroupMessageReq: { fields: {
      msgId: { type: "string", id: 1 }, groupId: { type: "string", id: 2 }, fromAccount: { type: "string", id: 3 }, toAccount: { type: "string", id: 4 }, random: { type: "string", id: 5 }, msgBody: { rule: "repeated", type: "MsgBodyElement", id: 6 }, refMsgId: { type: "string", id: 7 }
    } },
    SendC2CMessageRsp: { fields: { code: { type: "int32", id: 1 }, message: { type: "string", id: 2 } } },
    SendGroupMessageRsp: { fields: { code: { type: "int32", id: 1 }, message: { type: "string", id: 2 } } },
    InboundMessagePush: { fields: {
      callbackCommand: { type: "string", id: 1 }, fromAccount: { type: "string", id: 2 }, toAccount: { type: "string", id: 3 }, senderNickname: { type: "string", id: 4 }, groupCode: { type: "string", id: 5 }, groupName: { type: "string", id: 6 }, msgSeq: { type: "uint32", id: 7 }, msgRandom: { type: "uint32", id: 8 }, msgTime: { type: "uint32", id: 9 }, msgKey: { type: "string", id: 10 }, msgId: { type: "string", id: 11 }, msgBody: { rule: "repeated", type: "MsgBodyElement", id: 12 }, cloudCustomData: { type: "string", id: 13 }, eventTime: { type: "uint32", id: 14 }, botOwnerId: { type: "string", id: 15 }
    } }
  } }
} } } } } } };

function getRoot() {
  if (root) return root;
  try { protobuf ??= require("protobufjs"); } catch { return null; }
  root = protobuf.Root.fromJSON(schema);
  return root;
}
function lookupType(name) { return getRoot()?.lookupType(name) ?? null; }
function nextSeqNo() { sequence = sequence >= Number.MAX_SAFE_INTEGER ? 1 : sequence + 1; return sequence; }
function encodePB(typeName, value) {
  try { const type = lookupType(typeName); return type ? type.encode(type.create(value)).finish() : null; }
  catch (error) { console.warn(`[yuanbaoCodec] encode failed for ${typeName}:`, error); return null; }
}
function decodePB(typeName, data) {
  const type = lookupType(typeName);
  if (!type) return null;
  try { return type.toObject(type.decode(data), { defaults: true, longs: Number, bytes: Uint8Array }); } catch { return null; }
}
function encodeConnMsg(head, data) {
  const type = lookupType(`${CONN_PREFIX}.ConnMsg`);
  if (!type) return null;
  try { return type.encode(type.create({ head, data: data ?? new Uint8Array() })).finish(); }
  catch (error) { console.warn("[yuanbaoCodec] encodeConnMsg failed:", error); return null; }
}
function decodeConnMsg(raw) {
  const type = lookupType(`${CONN_PREFIX}.ConnMsg`);
  if (!type) return null;
  try {
    const value = type.toObject(type.decode(raw), { defaults: true, longs: Number, bytes: Uint8Array });
    return { head: value.head ?? {}, data: value.data instanceof Uint8Array ? value.data : new Uint8Array() };
  } catch { return null; }
}
function buildAuthBindMsg(params) {
  const data = encodePB(`${CONN_PREFIX}.AuthBindReq`, { bizId: params.bizId, authInfo: { uid: params.uid, source: params.source, token: params.token }, deviceInfo: { appVersion: params.appVersion ?? "", appOperationSystem: params.operationSystem ?? "", instanceId: "16", botVersion: params.botVersion ?? "" }, envName: params.envName ?? "" });
  return data && encodeConnMsg({ cmdType: CMD_TYPE.Request, cmd: CMD.AuthBind, seqNo: nextSeqNo(), msgId: params.msgId, module: MODULE.ConnAccess }, data);
}
function buildPingMsg(msgId) {
  const data = encodePB(`${CONN_PREFIX}.PingReq`, {});
  return data && encodeConnMsg({ cmdType: CMD_TYPE.Request, cmd: CMD.Ping, seqNo: nextSeqNo(), msgId, module: MODULE.ConnAccess }, data);
}
function decodePingRsp(data) { const value = decodePB(`${CONN_PREFIX}.PingRsp`, data); return value ? { heartInterval: Number(value.heartInterval ?? 0), timestamp: Number(value.timestamp ?? 0) } : null; }
function buildPushAck(head) { return encodeConnMsg({ cmdType: CMD_TYPE.PushAck, cmd: head.cmd ?? "", seqNo: nextSeqNo(), msgId: head.msgId ?? "", module: head.module ?? "" }); }
function decodeKickoutMsg(data) { const value = decodePB(`${CONN_PREFIX}.KickoutMsg`, data); return value ? { status: Number(value.status ?? 0), reason: String(value.reason ?? "") } : null; }
function decodePushMsg(data) { const value = decodePB(`${CONN_PREFIX}.PushMsg`, data); return value ? { cmd: String(value.cmd ?? ""), module: String(value.module ?? ""), msgId: String(value.msgId ?? ""), data: value.data instanceof Uint8Array ? value.data : new Uint8Array() } : null; }
function decodeInboundMessage(data) {
  const value = decodePB(`${BIZ_PREFIX}.InboundMessagePush`, data);
  if (!value) return null;
  const msgBody = (value.msgBody ?? []).map((item) => {
    const content = item.msgContent ?? {};
    return { msgType: String(item.msgType ?? ""), msgContent: { text: content.text, data: content.data, url: content.url, fileName: content.fileName, fileSize: content.fileSize == null ? undefined : Number(content.fileSize), uuid: content.uuid, imageFormat: content.imageFormat == null ? undefined : Number(content.imageFormat), imageInfoArray: content.imageInfoArray?.map((image) => ({ type: Number(image.type ?? 0), size: Number(image.size ?? 0), width: Number(image.width ?? 0), height: Number(image.height ?? 0), url: String(image.url ?? "") })) } };
  });
  return { callbackCommand: String(value.callbackCommand ?? ""), fromAccount: String(value.fromAccount ?? ""), toAccount: String(value.toAccount ?? ""), senderNickname: String(value.senderNickname ?? ""), groupId: String(value.groupCode ?? ""), groupName: String(value.groupName ?? ""), msgId: String(value.msgId ?? ""), msgBody, msgTime: Number(value.msgTime ?? 0), cloudCustomData: value.cloudCustomData ? String(value.cloudCustomData) : undefined };
}
function encodeSendC2CMessageReq(params) { return encodePB(`${BIZ_PREFIX}.SendC2CMessageReq`, { msgId: params.msgId, toAccount: params.toAccount, fromAccount: params.fromAccount, msgRandom: params.msgRandom, msgBody: params.msgBody }); }
function encodeSendGroupMessageReq(params) { return encodePB(`${BIZ_PREFIX}.SendGroupMessageReq`, { msgId: params.msgId, groupId: params.groupId, fromAccount: params.fromAccount, msgBody: params.msgBody, ...(params.refMsgId ? { refMsgId: params.refMsgId } : {}) }); }
function decodeSendMessageRsp(data) { const value = decodePB(`${BIZ_PREFIX}.SendC2CMessageRsp`, data) ?? decodePB(`${BIZ_PREFIX}.SendGroupMessageRsp`, data); return value ? { code: Number(value.code ?? 0), message: String(value.message ?? "") } : null; }
function buildBusinessConnMsg(cmd, module, data, msgId) { return encodeConnMsg({ cmdType: CMD_TYPE.Request, cmd, seqNo: nextSeqNo(), msgId, module }, data); }

module.exports = { CMD_TYPE, CMD, MODULE, buildAuthBindMsg, buildPingMsg, decodePingRsp, buildPushAck, decodeKickoutMsg, decodePushMsg, decodeConnMsg, decodeInboundMessage, encodeSendC2CMessageReq, encodeSendGroupMessageReq, decodeSendMessageRsp, buildBusinessConnMsg };
