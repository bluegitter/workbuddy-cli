'use strict';

const STORAGE_RPC_CHANNELS = Object.freeze({
  GET_SESSIONS: 'storage:getSessions',
  UPSERT_SESSION: 'storage:upsertSession',
  DELETE_SESSION: 'storage:deleteSession',
  GET_WORKSPACES: 'storage:getWorkspaces',
  UPDATE_SESSION_PERMISSION_MODE: 'storage:updateSessionPermissionMode',
  GET_RECOVERY_NOTICE: 'storage:getRecoveryNotice',
});

module.exports = { STORAGE_RPC_CHANNELS };
