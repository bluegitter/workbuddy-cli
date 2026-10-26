'use strict';

const { getRendererTranslation } = require('../prompt/tencent-docs-prompt-local-paths');

function formatLocalPreviewText(key, values = {}, options = {}) {
  const template = options.translate?.(`tencentDocs.localPreview.${key}`) ?? getRendererTranslation(`tencentDocs.localPreview.${key}`, options.locale || 'en-US', options.resources);
  return Object.entries(values).reduce((text, [name, value]) => String(text).replaceAll(`{{${name}}}`, String(value)).replaceAll(`{${name}}`, String(value)), template);
}

module.exports = Object.freeze({ formatLocalPreviewText });
