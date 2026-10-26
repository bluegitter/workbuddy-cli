'use strict';
function createConnectorOAuthCallbackFacade(deps) { return { isOAuthCallbackUrl: (url) => deps.connectorMcpProxy.isOAuthCallbackUrl(url), handleOAuthCallbackFromUrl: (url) => deps.connectorMcpProxy.handleOAuthCallbackFromUrl(url), handleOAuthCallback: (state, code) => deps.connectorMcpProxy.handleOAuthCallback(state, code) }; }
module.exports = Object.freeze({ createConnectorOAuthCallbackFacade });
