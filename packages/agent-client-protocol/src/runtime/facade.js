'use strict';

const { RequestError, RpcConnection } = require('./rpc-connection');

const AGENT_METHODS = Object.freeze({
  authenticate: 'authenticate', document_did_change: 'document/didChange', document_did_close: 'document/didClose', document_did_focus: 'document/didFocus', document_did_open: 'document/didOpen', document_did_save: 'document/didSave', initialize: 'initialize', logout: 'logout', nes_accept: 'nes/accept', nes_close: 'nes/close', nes_reject: 'nes/reject', nes_start: 'nes/start', nes_suggest: 'nes/suggest', providers_disable: 'providers/disable', providers_list: 'providers/list', providers_set: 'providers/set', session_cancel: 'session/cancel', session_close: 'session/close', session_delete: 'session/delete', session_fork: 'session/fork', session_list: 'session/list', session_load: 'session/load', session_new: 'session/new', session_prompt: 'session/prompt', session_resume: 'session/resume', session_set_config_option: 'session/set_config_option', session_set_mode: 'session/set_mode',
});
const CLIENT_METHODS = Object.freeze({ elicitation_complete: 'elicitation/complete', elicitation_create: 'elicitation/create', fs_read_text_file: 'fs/read_text_file', fs_write_text_file: 'fs/write_text_file', mcp_connect: 'mcp/connect', mcp_disconnect: 'mcp/disconnect', mcp_message: 'mcp/message', session_request_permission: 'session/request_permission', session_update: 'session/update', terminal_create: 'terminal/create', terminal_kill: 'terminal/kill', terminal_output: 'terminal/output', terminal_release: 'terminal/release', terminal_wait_for_exit: 'terminal/wait_for_exit' });
const PROTOCOL_VERSION = 1;
const emptyObject = (value) => value ?? {};

function methodHandler(target, methodMap, method, params) {
  const handlerName = Object.keys(methodMap).find((key) => methodMap[key] === method);
  const handler = handlerName && target[handlerName];
  if (typeof handler !== 'function') throw RequestError.methodNotFound(method);
  return handler.call(target, params);
}

const AGENT_REQUEST_HANDLERS = Object.freeze({
  initialize: 'initialize', session_new: 'newSession', session_load: 'loadSession', session_list: 'listSessions', session_delete: 'deleteSession', session_fork: 'unstable_forkSession', session_resume: 'resumeSession', session_close: 'closeSession', session_set_mode: 'setSessionMode', authenticate: 'authenticate', providers_list: 'unstable_listProviders', providers_set: 'unstable_setProvider', providers_disable: 'unstable_disableProvider', logout: 'logout', session_prompt: 'prompt', session_set_config_option: 'setSessionConfigOption', nes_start: 'unstable_startNes', nes_suggest: 'unstable_suggestNes', nes_close: 'unstable_closeNes',
});
const AGENT_NOTIFICATION_HANDLERS = Object.freeze({ session_cancel: 'cancel', document_did_open: 'unstable_didOpenDocument', document_did_change: 'unstable_didChangeDocument', document_did_close: 'unstable_didCloseDocument', document_did_save: 'unstable_didSaveDocument', document_did_focus: 'unstable_didFocusDocument', nes_accept: 'unstable_acceptNes', nes_reject: 'unstable_rejectNes' });
const CLIENT_REQUEST_HANDLERS = Object.freeze({ fs_write_text_file: 'writeTextFile', fs_read_text_file: 'readTextFile', session_request_permission: 'requestPermission', terminal_create: 'createTerminal', terminal_output: 'terminalOutput', terminal_release: 'releaseTerminal', terminal_wait_for_exit: 'waitForExit', terminal_kill: 'killTerminal', elicitation_create: 'unstable_createElicitation' });

class TerminalHandle {
  constructor(id, sessionId, connection) { this.id = id; this.sessionId = sessionId; this.connection = connection; }
  currentOutput() { return this.connection.sendRequest(CLIENT_METHODS.terminal_output, { sessionId: this.sessionId, terminalId: this.id }); }
  waitForExit() { return this.connection.sendRequest(CLIENT_METHODS.terminal_wait_for_exit, { sessionId: this.sessionId, terminalId: this.id }); }
  kill() { return this.connection.sendRequest(CLIENT_METHODS.terminal_kill, { sessionId: this.sessionId, terminalId: this.id }).then(emptyObject); }
  release() { return this.connection.sendRequest(CLIENT_METHODS.terminal_release, { sessionId: this.sessionId, terminalId: this.id }).then(emptyObject); }
  async [Symbol.asyncDispose]() { await this.release(); }
}

class AgentSideConnection {
  constructor(toAgent, stream) {
    const agent = toAgent(this);
    const requests = async (method, params) => {
      const handler = AGENT_REQUEST_HANDLERS[Object.keys(AGENT_METHODS).find((key) => AGENT_METHODS[key] === method)];
      if (!handler || typeof agent[handler] !== 'function') throw RequestError.methodNotFound(method);
      return agent[handler](params);
    };
    const notifications = async (method, params) => {
      const handlerName = Object.keys(AGENT_METHODS).find((key) => AGENT_METHODS[key] === method);
      const handler = handlerName && agent[AGENT_NOTIFICATION_HANDLERS[handlerName]];
      if (typeof handler !== 'function') {
        if (typeof agent.extNotification === 'function') return agent.extNotification(method, params);
        throw RequestError.methodNotFound(method);
      }
      return handler.call(agent, params);
    };
    this.connection = new RpcConnection(requests, notifications, stream);
  }
  sessionUpdate(params) { return this.connection.sendNotification(CLIENT_METHODS.session_update, params); }
  requestPermission(params) { return this.connection.sendRequest(CLIENT_METHODS.session_request_permission, params); }
  readTextFile(params) { return this.connection.sendRequest(CLIENT_METHODS.fs_read_text_file, params); }
  writeTextFile(params) { return this.connection.sendRequest(CLIENT_METHODS.fs_write_text_file, params).then(emptyObject); }
  createTerminal(params) { return this.connection.sendRequest(CLIENT_METHODS.terminal_create, params, (response) => new TerminalHandle(response.terminalId, params.sessionId, this.connection)); }
  unstable_createElicitation(params) { return this.connection.sendRequest(CLIENT_METHODS.elicitation_create, params); }
  unstable_completeElicitation(params) { return this.connection.sendNotification(CLIENT_METHODS.elicitation_complete, params); }
  extMethod(method, params) { return this.connection.sendRequest(method, params); }
  extNotification(method, params) { return this.connection.sendNotification(method, params); }
  get signal() { return this.connection.signal; }
  get closed() { return this.connection.closed; }
}

class ClientSideConnection {
  constructor(toClient, stream) {
    const client = toClient(this);
    const requests = async (method, params) => {
      const key = Object.keys(CLIENT_METHODS).find((name) => CLIENT_METHODS[name] === method);
      const handler = key && CLIENT_REQUEST_HANDLERS[key];
      if (!handler || typeof client[handler] !== 'function') throw RequestError.methodNotFound(method);
      return client[handler](params);
    };
    const notifications = async (method, params) => {
      if (method === CLIENT_METHODS.session_update) return client.sessionUpdate(params);
      if (method === CLIENT_METHODS.elicitation_complete) return client.unstable_completeElicitation?.(params);
      return client.extNotification?.(method, params);
    };
    this.connection = new RpcConnection(requests, notifications, stream);
  }
  initialize(params) { return this.connection.sendRequest(AGENT_METHODS.initialize, params); }
  newSession(params) { return this.connection.sendRequest(AGENT_METHODS.session_new, params); }
  loadSession(params) { return this.connection.sendRequest(AGENT_METHODS.session_load, params).then(emptyObject); }
  unstable_forkSession(params) { return this.connection.sendRequest(AGENT_METHODS.session_fork, params); }
  listSessions(params) { return this.connection.sendRequest(AGENT_METHODS.session_list, params); }
  deleteSession(params) { return this.connection.sendRequest(AGENT_METHODS.session_delete, params).then(emptyObject); }
  resumeSession(params) { return this.connection.sendRequest(AGENT_METHODS.session_resume, params); }
  closeSession(params) { return this.connection.sendRequest(AGENT_METHODS.session_close, params); }
  setSessionMode(params) { return this.connection.sendRequest(AGENT_METHODS.session_set_mode, params).then(emptyObject); }
  setSessionConfigOption(params) { return this.connection.sendRequest(AGENT_METHODS.session_set_config_option, params); }
  authenticate(params) { return this.connection.sendRequest(AGENT_METHODS.authenticate, params).then(emptyObject); }
  unstable_listProviders(params) { return this.connection.sendRequest(AGENT_METHODS.providers_list, params); }
  unstable_setProvider(params) { return this.connection.sendRequest(AGENT_METHODS.providers_set, params).then(emptyObject); }
  unstable_disableProvider(params) { return this.connection.sendRequest(AGENT_METHODS.providers_disable, params).then(emptyObject); }
  logout(params) { return this.connection.sendRequest(AGENT_METHODS.logout, params).then(emptyObject); }
  prompt(params) { return this.connection.sendRequest(AGENT_METHODS.session_prompt, params); }
  cancel(params) { return this.connection.sendNotification(AGENT_METHODS.session_cancel, params); }
  unstable_startNes(params) { return this.connection.sendRequest(AGENT_METHODS.nes_start, params); }
  unstable_suggestNes(params) { return this.connection.sendRequest(AGENT_METHODS.nes_suggest, params); }
  unstable_closeNes(params) { return this.connection.sendRequest(AGENT_METHODS.nes_close, params).then(emptyObject); }
  unstable_didOpenDocument(params) { return this.connection.sendNotification(AGENT_METHODS.document_did_open, params); }
  unstable_didChangeDocument(params) { return this.connection.sendNotification(AGENT_METHODS.document_did_change, params); }
  unstable_didCloseDocument(params) { return this.connection.sendNotification(AGENT_METHODS.document_did_close, params); }
  unstable_didSaveDocument(params) { return this.connection.sendNotification(AGENT_METHODS.document_did_save, params); }
  unstable_didFocusDocument(params) { return this.connection.sendNotification(AGENT_METHODS.document_did_focus, params); }
  unstable_acceptNes(params) { return this.connection.sendNotification(AGENT_METHODS.nes_accept, params); }
  unstable_rejectNes(params) { return this.connection.sendNotification(AGENT_METHODS.nes_reject, params); }
  extMethod(method, params) { return this.connection.sendRequest(method, params); }
  extNotification(method, params) { return this.connection.sendNotification(method, params); }
  get signal() { return this.connection.signal; }
  get closed() { return this.connection.closed; }
}

module.exports = { AGENT_METHODS, CLIENT_METHODS, PROTOCOL_VERSION, AgentSideConnection, ClientSideConnection, TerminalHandle };
