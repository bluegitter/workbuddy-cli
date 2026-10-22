'use strict';

const { ALLOWED_LOOPBACK_HOSTS } = require('./connector-proxy-utils');

function extractHostname(host) {
  const trimmed = String(host || '').trim();
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return end > 0 ? trimmed.slice(1, end) : trimmed;
  }
  const colon = trimmed.indexOf(':');
  return colon >= 0 ? trimmed.slice(0, colon) : trimmed;
}

function isAllowedLoopbackHost(host) { return ALLOWED_LOOPBACK_HOSTS.has(extractHostname(host).toLowerCase()); }

function validateOrigin(origin) {
  if (!origin) return { allowed: true };
  try {
    const url = new URL(origin);
    const hostname = url.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
    return ALLOWED_LOOPBACK_HOSTS.has(hostname) ? { allowed: true } : { allowed: false, reason: 'invalid origin' };
  } catch { return { allowed: false, reason: 'malformed origin' }; }
}

function isValidProxyBearer(rawAuthorization, secret) { return typeof rawAuthorization === 'string' && rawAuthorization === `Bearer ${secret}`; }

module.exports = { extractHostname, isAllowedLoopbackHost, validateOrigin, isValidProxyBearer };
