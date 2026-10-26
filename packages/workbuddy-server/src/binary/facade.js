'use strict';
function createBinaryFacade(deps) { return { list: async () => deps.binaryService.list(), getStatus: async () => deps.binaryService.getStatus() }; }
module.exports = Object.freeze({ createBinaryFacade });
