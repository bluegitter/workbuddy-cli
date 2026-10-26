'use strict';

function createAsrFacade(deps) {
  const AsrService = deps.AsrService;
  if (typeof AsrService !== 'function') throw new TypeError('AsrService dependency is required');
  const asrService = new AsrService({ authenticationManager: deps.authenticationManager, productManager: deps.productManager, fetch: deps.fetch });
  return { speechToText: (params) => asrService.speechToText(params) };
}

module.exports = Object.freeze({ createAsrFacade });
