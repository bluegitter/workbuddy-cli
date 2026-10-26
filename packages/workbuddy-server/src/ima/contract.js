'use strict';

const IMA_RPC_CHANNELS = Object.freeze({
  AUTH_START: 'ima:auth:start', AUTH_STATUS: 'ima:auth:status', AUTH_REFRESH: 'ima:auth:refresh', AUTH_LOGOUT: 'ima:auth:logout',
  KB_LIST: 'ima:kb:list', KB_SEARCH: 'ima:kb:search', FILES_LIST: 'ima:files:list', FILES_SEARCH: 'ima:files:search',
  FILES_VIEW_URL: 'ima:files:view-url', FILES_DOWNLOAD_URL: 'ima:files:download-url', FILES_CONTENT: 'ima:files:content', FILES_BLOB: 'ima:files:blob',
  FILES_UPLOAD: 'ima:files:upload', FILES_CANCEL_UPLOAD: 'ima:files:cancel-upload', FILES_UPLOAD_BY_PATH: 'ima:files:upload-by-path',
  FILES_SDK_PREVIEW: 'ima:files:sdk-preview', UPLOAD_PROGRESS: 'ima:event:upload-progress',
});

module.exports = { IMA_RPC_CHANNELS };
