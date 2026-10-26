'use strict';

const { TENCENT_LEXIANG_RPC_CHANNELS } = require('./contract');

function registerTencentLexiangHandlers(registry, deps) {
  const service = Promise.resolve(deps.services).then((services) => services.tencentLexiang);

  registry.handle(TENCENT_LEXIANG_RPC_CHANNELS.GATEWAY_POST, async (path, body) => (
    (await service).gatewayPost(path, body)
  ));
  registry.handle(TENCENT_LEXIANG_RPC_CHANNELS.UPLOAD_LEXIANG_FILE, async (params) => (
    (await service).uploadLexiangFile(params)
  ));
  registry.handle(TENCENT_LEXIANG_RPC_CHANNELS.RESOLVE_ASSET_URL, async (assetUrl) => (
    (await service).resolveAssetUrl(assetUrl)
  ));
  registry.handle(TENCENT_LEXIANG_RPC_CHANNELS.CLEAR_WEB_COOKIES, async (params) => (
    (await service).clearWebCookies(params)
  ));
  registry.handle(TENCENT_LEXIANG_RPC_CHANNELS.CHECK_LICENSE, async () => (
    (await service).checkLicense()
  ));
  registry.handle(TENCENT_LEXIANG_RPC_CHANNELS.CHECK_COMPANY_STATUS, async () => (
    (await service).checkCompanyStatus()
  ));
  registry.handle(TENCENT_LEXIANG_RPC_CHANNELS.SP_API_REQUEST, async (params) => (
    (await service).spApiRequest(params)
  ));
  registry.handle(TENCENT_LEXIANG_RPC_CHANNELS.INVALIDATE_ACCESS_TOKEN, async () => (
    (await service).invalidateAccessToken()
  ));
}

module.exports = Object.freeze({ registerTencentLexiangHandlers });
