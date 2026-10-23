'use strict';

/**
 * Runtime registry for the agent provider boundary.
 *
 * The renderer bundle used to import minified symbols from an adjacent
 * agent-mail chunk. Keeping the registry dependency-injected makes the
 * package usable on its own and lets desktop, cloud, and tests provide only
 * the facades they actually own.
 */
class ProviderRegistry {
  constructor() {
    this.facades = Object.freeze({});
    this.connectorManager = undefined;
    this.initialized = false;
  }

  initialize({ facades = {}, connectorManager } = {}) {
    this.facades = facades && typeof facades === 'object' ? facades : {};
    this.connectorManager = connectorManager;
    this.initialized = true;
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({
      facades: this.facades,
      connectorManager: this.connectorManager,
    });
  }

  getFacades() {
    return this.facades;
  }

  getConnectorManager() {
    return this.connectorManager;
  }

  reset() {
    this.facades = Object.freeze({});
    this.connectorManager = undefined;
    this.initialized = false;
  }
}

const registry = new ProviderRegistry();

function initAppProviders(options) {
  return registry.initialize(options);
}

function getFacades() {
  return registry.getFacades();
}

function getConnectorManager() {
  return registry.getConnectorManager();
}

module.exports = Object.freeze({
  ProviderRegistry,
  getConnectorManager,
  getFacades,
  initAppProviders,
  initializeAppProviders: initAppProviders,
});
