'use strict';

const { AGENT_TEAMS_ENV_KEY, resolveAgentTeamsEnv } = require('./agent-teams-env');

function createAgentTeamsEnvResolver(options = {}) {
  const expertTypeBySession = new Map();
  return {
    recordSessionExpertType(sessionId, expertType) {
      if (!sessionId) return;
      if (expertType === undefined) expertTypeBySession.delete(sessionId);
      else expertTypeBySession.set(sessionId, expertType);
    },
    clearSession(sessionId) { if (sessionId) expertTypeBySession.delete(sessionId); },
    resolveForSession(sessionId) {
      const disableAgentTeams = options.getDisableAgentTeams
        ? options.getDisableAgentTeams()
        : typeof options.appConfig?.get === 'function'
          ? options.appConfig.get('disableAgentTeams')
          : options.appConfig?.disableAgentTeams;
      return resolveAgentTeamsEnv({ disableAgentTeams, expertType: expertTypeBySession.get(sessionId) });
    },
    getExpertType(sessionId) { return expertTypeBySession.get(sessionId); },
  };
}

module.exports = Object.freeze({ AGENT_TEAMS_ENV_KEY, createAgentTeamsEnvResolver });
