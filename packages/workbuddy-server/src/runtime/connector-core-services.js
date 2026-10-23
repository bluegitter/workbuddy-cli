'use strict';

const { createConnectorOAuthCallbackFacade, createConnectorServiceFacade } = require('./connector-service-facade');

/** Compose the connector services exposed by the app-server core registry. */
function createConnectorCoreServices(options = {}) {
  return {
    connectors: createConnectorServiceFacade({
      connectorService: options.connectorService,
      connectorUiAdapter: options.connectorUiAdapter,
    }),
    connectorOAuthCallbacks: createConnectorOAuthCallbackFacade({ connectorMcpProxy: options.connectorMcpProxy }),
  };
}

module.exports = { createConnectorCoreServices };
