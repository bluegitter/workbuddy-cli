'use strict';
const path = require('path');
const cwdPrecheck = require('./session-cwd-precheck');

function extractPreviewUrlLocalPath(url) {
  if (typeof url !== 'string' || !url) return undefined;
  let filePath;
  if (url.startsWith('file://')) {
    try { filePath = decodeURIComponent(new URL(url).pathname); } catch { return undefined; }
  } else if (path.isAbsolute(url)) {
    filePath = url;
  } else {
    return undefined;
  }
  return filePath ? path.normalize(filePath) : undefined;
}

module.exports = Object.freeze({ extractPreviewUrlLocalPath, ...cwdPrecheck });
