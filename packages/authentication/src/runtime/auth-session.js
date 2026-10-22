'use strict';

const { EventEmitter } = require('events');

class AuthSession extends EventEmitter {
  constructor(session = null) { super(); this.session = session; this.initialized = false; }

  setSession(session) {
    this.session = session || null;
    this.initialized = true;
    this.emit('change', this.session);
    return this.getStatus();
  }

  getSession() { return this.session; }
  getToken() { return this.session?.auth?.accessToken || null; }
  getStatus() {
    const account = this.session?.account;
    if (!account?.uid) return { loggedIn: false };
    return { loggedIn: true, user: { id: account.uid, name: account.nickname, email: '' } };
  }

  getAccount() {
    const { account, auth } = this.session || {};
    if (!account?.uid) return null;
    return {
      uid: account.uid, nickname: account.nickname, type: account.type || 'personal', lastLogin: true,
      domain: auth?.domain, enterpriseId: account.enterpriseId, enterpriseName: account.enterpriseName,
      enterpriseUserName: account.enterpriseUserName, isAdmin: account.isAdmin, oneidAccountId: account.oneidAccountId,
    };
  }

  buildAuthHeaders(withAuth = true, withEnterprise = true, withCSRF = false) {
    const { account, auth } = this.session || {};
    const headers = {};
    if (account?.uid) headers['X-User-Id'] = account.uid;
    if (withAuth && auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;
    if (account?.enterpriseId) { headers['X-Enterprise-Id'] = account.enterpriseId; headers['X-Tenant-Id'] = account.enterpriseId; }
    if (auth?.domain) headers['X-Domain'] = auth.domain;
    if (withEnterprise && account?.departmentFullName) headers['X-Department-Info'] = account.departmentFullName;
    if (withCSRF && auth?.refreshToken) headers['X-Refresh-Token'] = auth.refreshToken;
    return headers;
  }
}

module.exports = { AuthSession };
