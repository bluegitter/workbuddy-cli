'use strict';

const WORKBUDDY_AGENT_ACP_CLIENT_CONNECTION_TIMEOUT_MS = 180000;
const WORKBUDDY_AGENT_ACP_CLIENT_POST_TIMEOUT_MS = 10800000;

function createWorkbuddyAgentAcpClient(options) {
  const ClientClass = options.ClientClass || options.WorkbuddyACPClient;
  if (!ClientClass) throw new Error('WorkbuddyACPClient constructor is required');
  const client = new ClientClass({
    endpoint: options.endpoint,
    heartbeatTimeout: 0,
    connectionTimeout: WORKBUDDY_AGENT_ACP_CLIENT_CONNECTION_TIMEOUT_MS,
    postTimeout: WORKBUDDY_AGENT_ACP_CLIENT_POST_TIMEOUT_MS,
    logger: options.logger,
    supportsElicitation: options.supportsElicitation,
    onTransportActivity: options.onTransportActivity,
    onSessionUpdate: options.onSessionUpdate,
    onExtNotification: options.onExtNotification,
    onQuestionRequest: options.onQuestionRequest,
    onElicitationRequest: options.onElicitationRequest,
    onPermissionRequest: options.onPermissionRequest,
  });
  const raw = () => {
    if (!client.connection) throw new Error('[CodeBuddyACPClient] ACP connection is not initialized');
    return client.connection;
  };
  const wrap = (name) => (...args) => raw()[name](...args);
  return {
    connect: () => client.connect(),
    disconnect: () => client.disconnect(),
    get connection() {
      return Object.fromEntries(['newSession', 'loadSession', 'resumeSession', 'prompt', 'cancel', 'setSessionMode', 'unstable_setSessionModel', 'extMethod'].map((name) => [name, wrap(name)]));
    },
    debugState: () => client.debugState(),
    resolvePermission: (id, option) => client.resolvePermission(id, option),
    rejectPermission: (id, reason) => client.rejectPermission(id, reason),
    answerQuestion: (id, answers) => client.answerQuestion(id, answers),
    cancelQuestion: (id, reason) => client.cancelQuestion(id, reason),
    respondElicitation: (id, action, content) => client.respondElicitation(id, action, content),
    resolveInterruption: (sessionId, toolCallId, decision, answers) => client.resolveInterruption(sessionId, toolCallId, decision, answers),
  };
}

module.exports = Object.freeze({ WORKBUDDY_AGENT_ACP_CLIENT_CONNECTION_TIMEOUT_MS, WORKBUDDY_AGENT_ACP_CLIENT_POST_TIMEOUT_MS, createWorkbuddyAgentAcpClient });
