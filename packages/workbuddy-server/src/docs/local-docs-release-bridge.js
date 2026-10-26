'use strict';

function createLocalDocsReleaseBridgeFromFacade(facade) {
  return {
    releaseContext: (documentResourceUri, options) => facade.releaseContext(documentResourceUri, options),
    releaseContextIfClean: (documentResourceUri, options) => facade.releaseContextIfClean(documentResourceUri, options),
    saveContext: (documentResourceUri) => facade.saveContext(documentResourceUri),
  };
}

module.exports = Object.freeze({ createLocalDocsReleaseBridgeFromFacade });
