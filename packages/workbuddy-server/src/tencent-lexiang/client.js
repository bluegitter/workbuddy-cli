'use strict';

const { TENCENT_LEXIANG_RPC_CHANNELS } = require('./contract');

function invoke(channel) {
  return Object.freeze({ type: 'invoke', channel });
}

const TENCENT_LEXIANG_CHANNEL_MAP = Object.freeze({
  lexiangGatewayPost: invoke(TENCENT_LEXIANG_RPC_CHANNELS.GATEWAY_POST),
  lexiangUploadFile: invoke(TENCENT_LEXIANG_RPC_CHANNELS.UPLOAD_LEXIANG_FILE),
  lexiangResolveAssetUrl: invoke(TENCENT_LEXIANG_RPC_CHANNELS.RESOLVE_ASSET_URL),
  lexiangClearWebCookies: invoke(TENCENT_LEXIANG_RPC_CHANNELS.CLEAR_WEB_COOKIES),
  lexiangCheckLicense: invoke(TENCENT_LEXIANG_RPC_CHANNELS.CHECK_LICENSE),
  lexiangCheckCompanyStatus: invoke(TENCENT_LEXIANG_RPC_CHANNELS.CHECK_COMPANY_STATUS),
  lexiangSpApiRequest: invoke(TENCENT_LEXIANG_RPC_CHANNELS.SP_API_REQUEST),
  lexiangInvalidateAccessToken: invoke(TENCENT_LEXIANG_RPC_CHANNELS.INVALIDATE_ACCESS_TOKEN),
});

module.exports = Object.freeze({ TENCENT_LEXIANG_CHANNEL_MAP, invoke });
