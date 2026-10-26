'use strict';

const { AuthenticationStoragePriority, Edition } = require('./authentication-protocol');
const { Subject } = require('./default-authentication-storage');

const LONG_TIME_AGO = 1999999999999;
const AuthenticationType = Object.freeze({ CUSTOM_TOKEN: 'custom-token' });

function decodeJwtPayload(token) {
  try {
    const part = String(token).split('.')[1];
    if (!part) return undefined;
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch { return undefined; }
}

class CustomTokenAuthenticationStorage {
  constructor({ productManager, logger = console, env = process.env } = {}) { this.productManager = productManager; this.logger = logger; this.env = env; this.storeSessionSubject = new Subject(); }
  async priority() {
    if (!this.env.CODEBUDDY_AUTH_TOKEN && !this.hasAccProductConfigCustomToken() && !await this.hasSpilledAccProductConfigCustomToken()) return AuthenticationStoragePriority.Disabled;
    const product = this.productManager?.configuration?.getValue?.();
    const config = product || await this.productManager?.waitConfiguration?.(true);
    return config?.authentication?.type === AuthenticationType.CUSTOM_TOKEN && config.authentication.attributes?.token ? AuthenticationStoragePriority.Heigh : AuthenticationStoragePriority.Disabled;
  }
  getAccProductConfigAuthentication() { for (const key of ['ACC_PRODUCT_CONFIG_V3', 'ACC_PRODUCT_CONFIG_V2']) { try { const config = JSON.parse(this.env[key] || ''); if (config.authentication) return config.authentication; } catch {} } return undefined; }
  hasAccProductConfigCustomToken() { const auth = this.getAccProductConfigAuthentication(); return auth?.type === AuthenticationType.CUSTOM_TOKEN && Boolean(auth.attributes?.token); }
  async hasSpilledAccProductConfigCustomToken() { return false; }
  async store() {}
  async clean() {}
  async restore() {
    const product = await this.productManager?.waitConfiguration?.(true) || {};
    const token = product.authentication?.attributes?.token || this.env.CODEBUDDY_AUTH_TOKEN;
    if (!token) return undefined;
    const payload = decodeJwtPayload(token);
    const enterpriseId = product.authentication?.attributes?.enterpriseId || this.enterpriseIdFromIssuer(payload?.iss);
    const account = { uid: payload?.sub || this.env.ACC_USER_ID || this.env.ACC_USER_NICKNAME || 'anonymous', nickname: payload?.nickname || payload?.preferred_username || this.env.ACC_USER_NICKNAME || 'anonymous', enterpriseId, type: enterpriseId ? Edition.Ultimate : payload?.type || Edition.Personal, lastLogin: true };
    const session = { auth: { accessToken: token, expiresIn: LONG_TIME_AGO, expiresAt: LONG_TIME_AGO, refreshToken: '', refreshExpiresIn: LONG_TIME_AGO, refreshExpiresAt: LONG_TIME_AGO, tokenType: 'Bearer', scope: '', domain: this.extractDomain(payload?.iss) }, account, accounts: [account] };
    this.storeSessionSubject.next(session); return session;
  }
  enterpriseIdFromIssuer(issuer) { const item = String(issuer || '').split('/').pop(); return item.startsWith('sso-') ? item.slice(4) : undefined; }
  extractDomain(value) { try { return value ? new URL(value).hostname : undefined; } catch { const match = String(value || '').match(/https?:\/\/([^/]+)/); return match?.[1]; } }
}

class CustomTokenAuthenticationProvider {
  constructor({ productManager, storage } = {}) { this.productManager = productManager; this.customTokenAuthenticationStorage = storage || new CustomTokenAuthenticationStorage({ productManager }); }
  async support() { return (await this.productManager?.waitConfiguration?.())?.authentication?.type === AuthenticationType.CUSTOM_TOKEN; }
  async getAuthenticationType() { return [AuthenticationType.CUSTOM_TOKEN]; }
  async createSession() { const session = await this.customTokenAuthenticationStorage.restore(); if (!session) throw new Error('authentication token is undefined'); return session; }
  async refreshSession(session) { session.auth.lastRefreshTime = Date.now(); return session; }
  async removeSession() {}
  async switchAccount(_account, authSession) { return authSession; }
}

module.exports = { AuthenticationType, CustomTokenAuthenticationProvider, CustomTokenAuthenticationStorage, LONG_TIME_AGO, decodeJwtPayload };
