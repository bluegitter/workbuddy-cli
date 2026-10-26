'use strict';

const { TencentDocsAgentEditorTracker } = require('../session/tencent-docs-agent-editor-tracker');
const { createIsSessionStillProcessing } = require('../session/document-lifecycle-port');
const { buildLocalDocumentMediaTypeEntries } = require('../session/local-document-media-policy');

const LOCAL_DOCUMENT_KIND_BY_TENCENT_DOCS_KIND = Object.freeze({ doc: 'document', sheet: 'spreadsheet', slide: 'presentation' });

function createTencentDocsDocumentLifecycleDeps(args) {
  return {
    tracker: new TencentDocsAgentEditorTracker(),
    documentService: args.documentService,
    isSessionStillProcessing: createIsSessionStillProcessing(args.sessionManager),
    onSessionDeleted: args.clearOnlineSessionState ?? (() => {}),
    dispose: args.dispose,
  };
}

function createTencentDocsLocalDocumentMediaTypes(whitelist) {
  return buildLocalDocumentMediaTypeEntries((whitelist ?? []).map((item) => ({ kind: LOCAL_DOCUMENT_KIND_BY_TENCENT_DOCS_KIND[item.kind], extensions: item.extensions })));
}

module.exports = Object.freeze({ LOCAL_DOCUMENT_KIND_BY_TENCENT_DOCS_KIND, createTencentDocsDocumentLifecycleDeps, createTencentDocsLocalDocumentMediaTypes });
