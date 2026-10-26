'use strict';

const WORKBUDDY_SESSION_AUX_RPC_CHANNELS = Object.freeze({ GET_ACTIVE_SESSIONS: 'daemon:getActiveSessions' });

function createWorkbuddyDaemonSessionQueries(connection) {
  return {
    async getActiveSessions() {
      const channel = WORKBUDDY_SESSION_AUX_RPC_CHANNELS.GET_ACTIVE_SESSIONS;
      return assertSessionInfoArray(await connection.invoke(channel), channel);
    },
  };
}
function assertSessionInfoArray(value, channel) {
  if (!Array.isArray(value)) throw new Error(`Invalid response for ${channel}: expected an array`);
  return value;
}

module.exports = Object.freeze({ WORKBUDDY_SESSION_AUX_RPC_CHANNELS, createWorkbuddyDaemonSessionQueries, assertSessionInfoArray });
