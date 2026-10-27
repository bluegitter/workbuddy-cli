'use strict';

const STAGING_SSO_DOMAIN_REWRITES = Object.freeze({
  'staging-sso.codebuddy.cn': 'tencent.staging-sso.codebuddy.cn',
  'sso.copilot-staging.tencent.com': 'tencent.sso.copilot-staging.tencent.com',
});
const PROD_TO_STAGING_DOMAIN_REWRITES = Object.freeze({
  'www.codebuddy.cn': 'staging.codebuddy.cn',
  'codebuddy.cn': 'staging.codebuddy.cn',
  'copilot.tencent.com': 'staging-copilot.tencent.com',
});

let devEnvProvider = { isOverrideEnabled: () => false, readDevEnv: () => undefined };
function setWorkbuddyAuthDevEnvProvider(provider) { devEnvProvider = provider || devEnvProvider; }

function rewriteStagingAuthUrl(authUrl) {
  try {
    const url = new URL(authUrl);
    if (devEnvProvider.isOverrideEnabled() && devEnvProvider.readDevEnv() === 'staging') {
      url.hostname = PROD_TO_STAGING_DOMAIN_REWRITES[url.hostname] || STAGING_SSO_DOMAIN_REWRITES[url.hostname] || url.hostname;
    }
    return url.toString();
  } catch { return authUrl; }
}

class WorkbuddyExternalLinkAuthenticationProvider {
  constructor({ productManager, authenticationConfiguration, baseProvider } = {}) {
    this.productManager = productManager;
    this.authenticationConfiguration = authenticationConfiguration;
    this.baseProvider = baseProvider;
  }
  async support() {
    const type = this.productManager?.configuration?.getValue?.()?.authentication?.type || this.authenticationConfiguration?.()?.type;
    return type === 'cli-external-link';
  }
  async openAuthUrl(authState) {
    const next = { ...authState, authUrl: rewriteStagingAuthUrl(authState?.authUrl) };
    if (typeof this.baseProvider?.openAuthUrl === 'function') return this.baseProvider.openAuthUrl(next);
    return next;
  }
}

module.exports = { WorkbuddyExternalLinkAuthenticationProvider, setWorkbuddyAuthDevEnvProvider, rewriteStagingAuthUrl, STAGING_SSO_DOMAIN_REWRITES, PROD_TO_STAGING_DOMAIN_REWRITES };
