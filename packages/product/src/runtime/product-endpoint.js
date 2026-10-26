'use strict';

function normalizeEndpoint(endpoint) { return typeof endpoint === 'string' ? endpoint.trim().replace(/\/+$/, '') : ''; }
function resolveProductEndpoint(productManager, override) { return normalizeEndpoint(typeof override === 'function' ? override() : override) || normalizeEndpoint(productManager?.getEndpoint?.()); }
function buildProductHeaders(session) { if (!session?.auth?.accessToken) return null; const headers = { Accept: 'application/json', Authorization: `Bearer ${session.auth.accessToken}` }; if (session.account?.uid) headers['X-User-Id'] = session.account.uid; if (session.account?.enterpriseId) { headers['X-Enterprise-Id'] = session.account.enterpriseId; headers['X-Tenant-Id'] = session.account.enterpriseId; } if (session.auth.domain) headers['X-Domain'] = session.auth.domain; return headers; }
module.exports = { normalizeEndpoint, resolveProductEndpoint, buildProductHeaders };
