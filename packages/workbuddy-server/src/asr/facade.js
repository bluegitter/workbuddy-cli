'use strict';

const { AsrService } = require('./service');
function createAsrFacade(deps) { const service = new AsrService({ authenticationManager: deps.authenticationManager, productManager: deps.productManager, fetch: deps.fetch }); return { speechToText: (params) => service.speechToText(params) }; }
module.exports = Object.freeze({ createAsrFacade });
