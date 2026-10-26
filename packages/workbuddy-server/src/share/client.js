'use strict';

const { SHARE_RPC_CHANNELS } = require('./contract');

function invoke(channel) {
  return Object.freeze({ type: 'invoke', channel });
}

const SHARE_CHANNEL_MAP = Object.freeze({
  shareUploadFile: invoke(SHARE_RPC_CHANNELS.UPLOAD_FILE),
  shareUploadToKnowledge: invoke(SHARE_RPC_CHANNELS.UPLOAD_TO_KNOWLEDGE),
  shareCreateLink: invoke(SHARE_RPC_CHANNELS.CREATE_LINK),
  shareGetList: invoke(SHARE_RPC_CHANNELS.GET_LIST),
  shareDownloadFile: invoke(SHARE_RPC_CHANNELS.DOWNLOAD_FILE),
  shareSetEnabled: invoke(SHARE_RPC_CHANNELS.SET_ENABLED),
  shareGetDetail: invoke(SHARE_RPC_CHANNELS.GET_DETAIL),
  shareVerify: invoke(SHARE_RPC_CHANNELS.VERIFY),
  sharePrepareTask: invoke(SHARE_RPC_CHANNELS.PREPARE_TASK),
  shareUploadTaskFile: invoke(SHARE_RPC_CHANNELS.UPLOAD_TASK_FILE),
  shareConfirmTask: invoke(SHARE_RPC_CHANNELS.CONFIRM_TASK),
  shareCancelTask: invoke(SHARE_RPC_CHANNELS.CANCEL_TASK),
  shareGetTaskList: invoke(SHARE_RPC_CHANNELS.GET_TASK_LIST),
  shareDeleteTask: invoke(SHARE_RPC_CHANNELS.DELETE_TASK),
  shareGenerateWxMPQRCode: invoke(SHARE_RPC_CHANNELS.GENERATE_WXMP_QRCODE),
  shareBatchMoveKnowledgeNodes: invoke(SHARE_RPC_CHANNELS.BATCH_MOVE_KNOWLEDGE_NODES),
  shareUploadLocalFileToCos: invoke(SHARE_RPC_CHANNELS.UPLOAD_LOCAL_FILE_TO_COS),
  shareUploadShareTemplate: invoke(SHARE_RPC_CHANNELS.UPLOAD_SHARE_TEMPLATE),
});

module.exports = Object.freeze({ SHARE_CHANNEL_MAP, invoke });
