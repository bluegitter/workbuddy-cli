'use strict';

const TENCENT_LEXIANG_RPC_CHANNELS = Object.freeze({
  GATEWAY_POST: 'tencentLexiang:gatewayPost',
  UPLOAD_LEXIANG_FILE: 'tencentLexiang:uploadLexiangFile',
  RESOLVE_ASSET_URL: 'tencentLexiang:resolveAssetUrl',
  CLEAR_WEB_COOKIES: 'tencentLexiang:clearWebCookies',
  CHECK_LICENSE: 'tencentLexiang:checkLicense',
  CHECK_COMPANY_STATUS: 'tencentLexiang:checkCompanyStatus',
  SP_API_REQUEST: 'tencentLexiang:spApiRequest',
  INVALIDATE_ACCESS_TOKEN: 'tencentLexiang:invalidateAccessToken',
});

const LEXIANG_COOKIE_DOMAINS = Object.freeze([
  'lexiangla.com',
  'lexiang-app.com',
  'lexiangla.net',
]);

class LexiangSpApiError extends Error {
  constructor(options) {
    super(options.message);
    this.name = 'LexiangSpApiError';
    this.status = options.status;
    this.method = options.method;
    this.path = options.path;
    this.reqId = options.reqId;
    this.serverRequestId = options.serverRequestId;
    this.bodySnippet = options.bodySnippet;
  }
}

module.exports = Object.freeze({
  LEXIANG_COOKIE_DOMAINS,
  LexiangSpApiError,
  TENCENT_LEXIANG_RPC_CHANNELS,
});
