'use strict';

const ENABLED = '1';
const DISABLED = '0';
const TEAM_EXPERT_TYPE = 'team';
const AGENT_TEAMS_ENV_KEY = 'CODEBUDDY_CODE_EXPERIMENTAL_AGENT_TEAMS';

function resolveAgentTeamsEnv(input = {}) {
  if (input.expertType === TEAM_EXPERT_TYPE) return ENABLED;
  return (input.disableAgentTeams ?? true) ? DISABLED : ENABLED;
}

module.exports = Object.freeze({ ENABLED, DISABLED, TEAM_EXPERT_TYPE, AGENT_TEAMS_ENV_KEY, resolveAgentTeamsEnv });
