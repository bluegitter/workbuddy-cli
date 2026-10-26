'use strict';

const IDENTITY_RPC_CHANNELS = Object.freeze({
  GET_NAME: 'identity:getName', UPDATE_NAME: 'identity:updateName', CHECK_MODERATION: 'identity:checkModeration', CHANGED: 'identity:changed',
  GET_LOCAL_MEMORY_FILES: 'identity:getLocalMemoryFiles', UPDATE_USER_CALL_NAME: 'identity:updateUserCallName', UPDATE_AI_NAME: 'identity:updateAiName',
  UPDATE_SOUL_BODY: 'identity:updateSoulBody', UPDATE_MEMORY_BODY: 'identity:updateMemoryBody',
});

module.exports = { IDENTITY_RPC_CHANNELS };
