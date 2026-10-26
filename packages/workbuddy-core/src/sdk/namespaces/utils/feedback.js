'use strict';

const { WBError } = require('../../../infra/wb-error');

function createFeedback(getSdk) {
  return async function feedback(options) {
    const sdk = getSdk();
    const http = sdk.http;
    if (!http) throw new WBError("wb.utils.feedback requires http. Ensure SDK is initialized with http.", { code: 'NOT_READY', source: 'utils.feedback' });
    const { content, type, attachments, includeRecentLogs } = options;
    const images = (attachments ?? []).filter((attachment) => (attachment.type ?? '').startsWith('image/'));
    const logFile = (attachments ?? []).filter((attachment) => !(attachment.type ?? '').startsWith('image/'))[0];
    const formData = new FormData();
    formData.append('content', String(content ?? ''));
    formData.append('client_type', String(type ?? 'feedback'));
    formData.append('platform', String(sdk.platform?.type ?? 'web'));
    if (sdk.platform?.appVersion) formData.append('client_version', sdk.platform.appVersion);
    if (sdk.telemetry?.machineId) formData.append('machine_id', sdk.telemetry.machineId);
    try {
      if (sdk.account?._cachedUid) formData.append('user_id', sdk.account._cachedUid);
    } catch {}
    for (const image of images) appendBase64File(formData, 'images', image);
    if (logFile) appendBase64File(formData, 'log_file', logFile);
    if (includeRecentLogs) formData.append('include_log', '1');
    return http.post('/v2/feedback', formData);
  };
}

function appendBase64File(formData, field, file) {
  try {
    const buffer = Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0));
    formData.append(field, new Blob([buffer], { type: file.type }), file.name);
  } catch {}
}

module.exports = Object.freeze({ createFeedback, appendBase64File });
