'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BrainArtifactService } = require('../packages/workbuddy-server/src/session/brain-artifact-service');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-brain-artifacts-'));
try {
  const service = new BrainArtifactService({ configDir: root });
  const brainDir = path.join(root, 'brain', 'session-1');
  const plansDir = path.join(root, 'plans');
  fs.mkdirSync(brainDir, { recursive: true });
  fs.mkdirSync(plansDir, { recursive: true });

  const overviewPath = path.join(brainDir, 'overview.md');
  service.onToolCall('session-1', 'call-1', 'Write', { file_path: overviewPath, content: '# Project overview\n' });
  const overviewEvent = service.onToolCallResult('session-1', 'call-1', 'completed');
  assert.strictEqual(overviewEvent.event, 'created');
  assert.strictEqual(overviewEvent.artifact.type, 'overview');
  assert.strictEqual(overviewEvent.artifact.title, 'Project overview');
  assert.strictEqual(overviewEvent.artifact.enableEdit, true);

  const planPath = path.join(plansDir, 'plan.md');
  fs.writeFileSync(planPath, '# Delivery plan\n');
  service.onToolCall('session-1', 'call-2', 'Edit', { file_path: planPath });
  const planEvent = service.onToolCallResult('session-1', 'call-2', 'completed');
  assert.strictEqual(planEvent.event, 'updated');
  assert.strictEqual(planEvent.artifact.type, 'plan');
  assert.strictEqual(planEvent.artifact.text, '# Delivery plan\n');

  const mediaPath = path.join(brainDir, 'diagram.png');
  service.onToolCall('session-1', 'call-3', 'Write', { file_path: mediaPath });
  const mediaEvent = service.onToolCallResult('session-1', 'call-3', 'completed');
  assert.strictEqual(mediaEvent.artifact.type, 'media');
  assert.strictEqual(mediaEvent.artifact.contentType, 'image');
  assert.strictEqual(mediaEvent.artifact.mimeType, 'image/png');

  service.onToolCall('session-1', 'call-4', 'Write', { file_path: overviewPath, content: 'ignored' });
  assert.strictEqual(service.onToolCallResult('session-1', 'call-4', 'failed'), null);
  assert.strictEqual(service.onToolCallResult('session-1', 'call-4', 'completed'), null);
  assert.strictEqual(service.isArtifactFilePath(path.join(root, 'outside', 'file.md')), false);
  assert.strictEqual(service.determineMimeType('file.unknown'), 'application/octet-stream');
  console.log('brain artifact service tests passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
