'use strict';

const IDLE_CAPABILITY_RPC_CHANNELS = Object.freeze({
  RECORD_USAGE: 'idleCapability:recordUsage', RECORD_ACTIVE_DAY: 'idleCapability:recordActiveDay', GET_IDLE_CARD_DATA: 'idleCapability:getIdleCardData',
  MARK_SHOWN: 'idleCapability:markShown', DISMISS: 'idleCapability:dismiss', DISMISS_GLOBAL: 'idleCapability:dismissGlobal',
  FORGET_CAPABILITY: 'idleCapability:forgetCapability', LIST_CANDIDATES: 'idleCapability:listCandidates',
});

module.exports = { IDLE_CAPABILITY_RPC_CHANNELS };
