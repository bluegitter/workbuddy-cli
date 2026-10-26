'use strict';

const assert = require('node:assert');
const classifier = require('../packages/workbuddy-server/src/claw/reply-error-classifier');

assert.strictEqual(classifier.isDestroyedSessionError(new Error('CodeBuddyCodeBackend session has been destroyed')), true);
assert.strictEqual(classifier.shouldRecoverWithFreshClawSession({ error: { message: 'session has been destroyed' } }), true);
assert.strictEqual(classifier.shouldResetConversationOnReplyError(new Error('ECONNRESET')), true);
assert.strictEqual(classifier.shouldResetConversationOnReplyError(new Error('temporary validation warning')), false);
assert.strictEqual(classifier.normalizeErrorText({ message: 'outer', cause: { msg: 'inner' } }), 'outer inner');
console.log('reply error classifier tests passed');
