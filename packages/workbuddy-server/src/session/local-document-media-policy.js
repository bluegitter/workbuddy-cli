'use strict';

const LOCAL_DOCUMENT_MEDIA_TYPE_BY_KIND = Object.freeze({
  document: Object.freeze({ mimeType: 'application/msword', contentType: 'document' }),
  spreadsheet: Object.freeze({ mimeType: 'application/vnd.ms-excel', contentType: 'spreadsheet' }),
  presentation: Object.freeze({ mimeType: 'application/vnd.ms-powerpoint', contentType: 'presentation' }),
});

function normalizeLocalDocumentExtension(extension) { return extension.replace(/^\./, '').toLowerCase(); }
function buildLocalDocumentMediaTypeEntries(whitelist) {
  return Object.freeze(whitelist.flatMap(({ kind, extensions }) => {
    const mediaType = LOCAL_DOCUMENT_MEDIA_TYPE_BY_KIND[kind];
    if (!mediaType) throw new Error(`Unsupported local document kind: ${kind}`);
    return extensions.map((extension) => Object.freeze({ extension: normalizeLocalDocumentExtension(extension), mimeType: mediaType.mimeType, contentType: mediaType.contentType }));
  }));
}
function applyLocalDocumentMediaTypes(target, entries) {
  for (const entry of entries) {
    const key = normalizeLocalDocumentExtension(entry.extension);
    target[key] ??= { mimeType: entry.mimeType, contentType: entry.contentType };
  }
  return target;
}

module.exports = Object.freeze({ LOCAL_DOCUMENT_MEDIA_TYPE_BY_KIND, normalizeLocalDocumentExtension, buildLocalDocumentMediaTypeEntries, applyLocalDocumentMediaTypes });
