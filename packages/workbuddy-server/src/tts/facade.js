'use strict';
function createTtsFacade(deps) { const { TtsService } = require('./service'); const service = new TtsService({ authenticationManager: deps.authenticationManager, productManager: deps.productManager, fetch: deps.fetch }); return { startTts: (params, pushEvent) => service.startTts(params, pushEvent), stopTts: (params) => service.stopTts(params) }; }
module.exports = { createTtsFacade };
