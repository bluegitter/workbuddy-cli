'use strict';

const { readArtifactBlobs } = require('../../../runtime/share-artifacts');

// Static-share orchestration is still being extracted from the renderer bundle;
// expose the stable file-blob primitive at its original path in the meantime.
module.exports = { readArtifactBlobs };
