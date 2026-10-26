'use strict';

const MEMORY_RPC_CHANNELS = Object.freeze({
  GET_PROFILE: 'memory:getProfile',
  SAVE_SETTINGS: 'memory:saveSettings',
  SUBMIT_SUGGESTION: 'memory:submitSuggestion',
  IMPORT_CONTENT: 'memory:importContent',
  CLEAR_PROFILE: 'memory:clearProfile',
  CHECK_UPDATING: 'memory:checkUpdating',
});

module.exports = { MEMORY_RPC_CHANNELS };
