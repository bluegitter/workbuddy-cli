'use strict';

const assert = require('node:assert');
const path = require('node:path');
const { MediaArtifactService, mediaInfoForPath } = require('../packages/workbuddy-server/src/session/media-artifact-service');

assert.deepStrictEqual(mediaInfoForPath('/tmp/a.png'), { mimeType: 'image/png', contentType: 'image' });
const events = [];
const service = new MediaArtifactService({ pushEvent: (channel, payload) => events.push({ channel, payload }) });
service.registerSession('s1', '/workspace');
service.markSessionExecuting('s1', '/workspace');
assert.strictEqual(service.findOwnerSessionIdForPath('/workspace/out/a.png'), 's1');
service.registerExplicitMedia({ sessionId: 's1', filePath: path.join('/workspace', 'out', 'a.png'), sourceType: 'tool_result' });
assert.deepStrictEqual(service.getExplicitOwnerSessionIdsForPath('/workspace/out/a.png'), ['s1']);
service.registerMediaArtifact('s1', '/workspace/out/a.png');
assert.strictEqual(service.getSessionArtifacts('s1')[0].contentType, 'image');
assert.strictEqual(events.length, 1);
service.dispose();
console.log('media artifact service tests passed');
