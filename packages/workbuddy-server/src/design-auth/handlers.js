'use strict';
const DESIGN_AUTH_CHECK_CHANNEL = 'designAuth:checkSessionEntered';
const ARDOT_CONNECTOR_NAME = 'ardot';
function toDesignAuthStatus(status) { return status === 'connected' ? 'authorized' : status === 'expired' ? 'expired' : 'unbound'; }
function registerDesignAuthHandlers(registry, deps) { const checkedSessions = new Set(); registry.handle(DESIGN_AUTH_CHECK_CHANNEL, async (params) => { const value = params && typeof params === 'object' ? params : {}; const sessionId = typeof value.sessionId === 'string' ? value.sessionId : undefined; if (value.welcomeMode !== 'design' || (!value.force && sessionId && checkedSessions.has(sessionId))) return { checked: false, status: 'skipped' }; const status = toDesignAuthStatus(await deps.checkConnectorStatus(ARDOT_CONNECTOR_NAME)); if (sessionId) checkedSessions.add(sessionId); deps.logger?.info?.('[DesignAuth] checked design session auth', { sessionId, status, force: value.force === true }); return { checked: true, status }; }); return registry; }
module.exports = Object.freeze({ DESIGN_AUTH_CHECK_CHANNEL, ARDOT_CONNECTOR_NAME, toDesignAuthStatus, registerDesignAuthHandlers });
