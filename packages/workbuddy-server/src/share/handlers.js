'use strict';

const { SHARE_RPC_CHANNELS } = require('./contract');

const FORWARDED_METHODS = Object.freeze([
  [SHARE_RPC_CHANNELS.UPLOAD_FILE, 'uploadFile'],
  [SHARE_RPC_CHANNELS.UPLOAD_TO_KNOWLEDGE, 'uploadToKnowledge'],
  [SHARE_RPC_CHANNELS.CREATE_LINK, 'createLink'],
  [SHARE_RPC_CHANNELS.GET_LIST, 'getList'],
  [SHARE_RPC_CHANNELS.DOWNLOAD_FILE, 'downloadFile'],
  [SHARE_RPC_CHANNELS.SET_ENABLED, 'setEnabled'],
  [SHARE_RPC_CHANNELS.GET_DETAIL, 'getDetail'],
  [SHARE_RPC_CHANNELS.VERIFY, 'verify'],
  [SHARE_RPC_CHANNELS.PREPARE_TASK, 'prepareTask'],
  [SHARE_RPC_CHANNELS.UPLOAD_TASK_FILE, 'uploadTaskFile'],
  [SHARE_RPC_CHANNELS.CONFIRM_TASK, 'confirmTask'],
  [SHARE_RPC_CHANNELS.CANCEL_TASK, 'cancelTask'],
  [SHARE_RPC_CHANNELS.GET_TASK_LIST, 'getTaskList'],
  [SHARE_RPC_CHANNELS.DELETE_TASK, 'deleteTask'],
  [SHARE_RPC_CHANNELS.BATCH_MOVE_KNOWLEDGE_NODES, 'batchMoveKnowledgeNodes'],
  [SHARE_RPC_CHANNELS.UPLOAD_LOCAL_FILE_TO_COS, 'uploadLocalFileToCos'],
  [SHARE_RPC_CHANNELS.UPLOAD_SHARE_TEMPLATE, 'uploadShareTemplate'],
]);

function registerShareHandlers(registry, deps) {
  const service = Promise.resolve(deps.services).then((services) => services.share);

  for (const [channel, method] of FORWARDED_METHODS) {
    registry.handle(channel, async (params) => (await service)[method](params));
  }

  registry.handle(SHARE_RPC_CHANNELS.GENERATE_WXMP_QRCODE, async (params) => {
    const { bizType, shareCode, shareUrl, shareTitle, shareCover } = params;
    return (await service).generateWxMPQRCode(
      bizType,
      shareCode,
      shareUrl,
      shareTitle,
      shareCover,
    );
  });
}

module.exports = Object.freeze({ FORWARDED_METHODS, registerShareHandlers });
