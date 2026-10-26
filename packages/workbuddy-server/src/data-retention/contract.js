'use strict';
const DATA_RETENTION_RPC_CHANNELS = Object.freeze({ GET_STORAGE_USAGE: 'dataRetention:getStorageUsage', GET_DISK_INFO: 'dataRetention:getDiskInfo', GET_POLICY: 'dataRetention:getPolicy', SET_POLICY: 'dataRetention:setPolicy', GET_LAST_CLEANUP_RESULT: 'dataRetention:getLastCleanupResult' });
module.exports = { DATA_RETENTION_RPC_CHANNELS };
