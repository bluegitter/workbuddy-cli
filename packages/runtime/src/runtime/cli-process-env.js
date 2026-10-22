'use strict';

const CLI_STATIC_MANAGED_ENV = Object.freeze({
  ELECTRON_RUN_AS_NODE: '1',
  CODEBUDDY_DISABLE_IDE: '1',
  SERVER__PORT: '0',
  SERVER__HOST: '127.0.0.1',
});

const ENV_BLOCKED_PREFIXES = ['CODEBUDDY_', 'ELECTRON_', 'VITE_', 'ACC_PRODUCT_CONFIG_'];
const ENV_BLOCKED_KEYS = new Set([
  'NODE_OPTIONS', 'NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE', 'NODE_PATH', 'NODE_DEBUG',
  'NODE_DEBUG_NATIVE', 'NODE_REPL_HISTORY', 'NODE_PENDING_DEPRECATION', 'NODE_REDIRECT_WARNINGS',
  'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'OPENSSL_CONF',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'WORKBUDDY_PROXY_SOURCE', 'WORKBUDDY_PAC_RPC_SOCKET',
  'WORKBUDDY_PAC_RPC_TOKEN', 'SERVER__PORT', 'SERVER__HOST', 'UV_THREADPOOL_SIZE',
]);

function buildCliProcessEnv(managedEnv = {}, hostEnv = process.env) {
  const passedEnv = {};
  for (const [key, value] of Object.entries(hostEnv || {})) {
    if (value === undefined) continue;
    const canonicalKey = key.toUpperCase();
    if (ENV_BLOCKED_KEYS.has(canonicalKey)) continue;
    if (ENV_BLOCKED_PREFIXES.some((prefix) => canonicalKey.startsWith(prefix))) continue;
    passedEnv[key] = value;
  }
  return { ...passedEnv, ...managedEnv };
}

module.exports = { CLI_STATIC_MANAGED_ENV, ENV_BLOCKED_KEYS, ENV_BLOCKED_PREFIXES, buildCliProcessEnv };
