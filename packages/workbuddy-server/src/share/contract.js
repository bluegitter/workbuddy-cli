'use strict';

const SHARE_RPC_CHANNELS = Object.freeze({
  UPLOAD_FILE: 'share:uploadFile',
  UPLOAD_TO_KNOWLEDGE: 'share:uploadToKnowledge',
  CREATE_LINK: 'share:createLink',
  GET_LIST: 'share:getList',
  DOWNLOAD_FILE: 'share:downloadFile',
  SET_ENABLED: 'share:setEnabled',
  GET_DETAIL: 'share:getDetail',
  VERIFY: 'share:verify',
  PREPARE_TASK: 'share:prepareTask',
  UPLOAD_TASK_FILE: 'share:uploadTaskFile',
  CONFIRM_TASK: 'share:confirmTask',
  CANCEL_TASK: 'share:cancelTask',
  GET_TASK_LIST: 'share:getTaskList',
  DELETE_TASK: 'share:deleteTask',
  GENERATE_WXMP_QRCODE: 'share:generateWxMPQRCode',
  BATCH_MOVE_KNOWLEDGE_NODES: 'share:batchMoveKnowledgeNodes',
  UPLOAD_LOCAL_FILE_TO_COS: 'share:uploadLocalFileToCos',
  UPLOAD_SHARE_TEMPLATE: 'share:uploadShareTemplate',
});

module.exports = { SHARE_RPC_CHANNELS };
