'use strict';

const crypto = require('crypto');

const GATEWAY_AUTH_MODE_ENV = 'CODEBUDDY_GATEWAY_AUTH';
const GATEWAY_PASSWORD_ENV = 'CODEBUDDY_GATEWAY_PASSWORD';
const GATEWAY_DISABLE_API_DOCS_ENV = 'CODEBUDDY_GATEWAY_DISABLE_API_DOCS';
let cachedSecret;

function getGatewaySecret() {
  if (!cachedSecret) cachedSecret = crypto.randomBytes(32).toString('base64url');
  return cachedSecret;
}

function gatewaySecretEnv() {
  return { [GATEWAY_AUTH_MODE_ENV]: 'password', [GATEWAY_PASSWORD_ENV]: getGatewaySecret(), [GATEWAY_DISABLE_API_DOCS_ENV]: '1' };
}

function gatewaySecretHeaders() { return { Authorization: `Bearer ${getGatewaySecret()}` }; }

module.exports = { GATEWAY_AUTH_MODE_ENV, GATEWAY_DISABLE_API_DOCS_ENV, GATEWAY_PASSWORD_ENV, gatewaySecretEnv, gatewaySecretHeaders, getGatewaySecret };
