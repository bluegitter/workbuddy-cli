const assert = require('node:assert/strict');

const taskUtils = require('../packages/agent-ui/src/utils/share/common/share-task-utils');
const artifactFilter = require('../packages/agent-ui/src/utils/share-artifact-filter');
const cwdArtifacts = require('../packages/agent-ui/src/utils/share/dom-snapshot-share/share-cwd-artifacts');
const selectionArtifacts = require('../packages/agent-ui/src/utils/share/template-share/share-selection-artifacts');
const staticShare = require('../packages/agent-ui/src/utils/share/dom-snapshot-share/static-share');
const moderation = require('../packages/agent-ui/src/hooks/share-moderation');

assert.equal(taskUtils.DEFAULT_SHARE_TITLE, 'Workbuddy Preview');
assert.equal(artifactFilter.isUnsupportedOverseasArtifact('report.pdf'), true);
assert.equal(artifactFilter.isUnsupportedOverseasArtifact('readme.md'), false);
assert.equal(typeof cwdArtifacts.readCwdArtifacts, 'function');
assert.equal(typeof selectionArtifacts.collectShareArtifacts, 'function');
assert.equal(typeof staticShare.readArtifactBlobs, 'function');
assert.equal(typeof moderation, 'object');

console.log('agent ui original share path tests passed');
