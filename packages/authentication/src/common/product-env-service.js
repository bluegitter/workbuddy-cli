'use strict';

const { ENV_KEY_CODEBUDDY_COPILOT_INTERNET_ENVIRONMENT, ProductEnviroment } = require('./authentication-protocol');

class ProductEnvService {
  constructor({ productManager, sessionProvider } = {}) { this.productManager = productManager; this.sessionProvider = sessionProvider; }
  async switch(env) { process.env[ENV_KEY_CODEBUDDY_COPILOT_INTERNET_ENVIRONMENT] = env || ''; await this.productManager?.sync?.(); }
  async switchBySession(session) { if (!session) return; await this.switch(await this.resolveEnvBySession(session)); }
  async getCurrent() {
    if (process.env[ENV_KEY_CODEBUDDY_COPILOT_INTERNET_ENVIRONMENT]) return process.env[ENV_KEY_CODEBUDDY_COPILOT_INTERNET_ENVIRONMENT];
    const product = await this.productManager?.waitConfiguration?.();
    if (product?.networkEnvironment) return product.networkEnvironment;
    const session = await this.sessionProvider?.();
    return this.resolveEnvBySession(session, product);
  }
  async resolveEnvBySession(session, product) {
    if (!session) return undefined;
    const config = product || await this.productManager?.waitConfiguration?.() || {};
    const attributes = config.authentication?.attributes || {};
    if (this.isDomain(attributes.internalDomain, session.auth?.domain)) return ProductEnviroment.Internal;
    if (this.isDomain(attributes.iOADomain, session.auth?.domain)) return ProductEnviroment.IOA;
    if (this.isDomain(attributes.cloudHostedDomain, session.auth?.domain)) return ProductEnviroment.Cloudhosted;
    if (this.isDomain(attributes.externalDomain, session.auth?.domain)) return ProductEnviroment.External;
    if (session.auth?.domain) return ProductEnviroment.Selfhosted;
    return undefined;
  }
  isDomain(configDomain, currentDomain) { if (!configDomain || !currentDomain) return false; return Array.isArray(configDomain) ? configDomain.some((domain) => this.matchDomain(domain, currentDomain)) : this.matchDomain(configDomain, currentDomain); }
  matchDomain(pattern, domain) { if (pattern === domain) return true; if (!pattern.includes('*')) return false; const regexPattern = String(pattern).replace(/\./g, '\\.').replace(/\*/g, '[^.]*'); return new RegExp(`^${regexPattern}$`).test(domain); }
}

module.exports = { ProductEnvService, ProductEnvServiceImpl: ProductEnvService };
