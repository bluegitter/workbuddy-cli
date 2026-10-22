'use strict';

function createConnectingEntry(configId, client, serverConfig = {}) {
  return { configId, client, tools: [], status: 'connecting', needsAuth: false, error: undefined, reconnectAttempts: 0, manualDisconnect: false, serverConfig: { ...serverConfig } };
}

function snapshotClientEntry(entry) {
  if (!entry) return undefined;
  return { configId: entry.configId, client: entry.client, transport: null, tools: entry.tools, prompts: entry.prompts, resources: entry.resources, resourceTemplates: entry.resourceTemplates, status: entry.status, needsAuth: entry.needsAuth, error: entry.error };
}

function snapshotClientEntries(entries) {
  const result = new Map();
  for (const [configId, entry] of entries) result.set(configId, snapshotClientEntry(entry));
  return result;
}

function createToolEntry(configId, rawTool) {
  const shortName = String(configId).includes(':') ? String(configId).slice(String(configId).indexOf(':') + 1) : String(configId);
  return { ...rawTool, name: `${shortName}_${rawTool.name}` };
}

function classifyPreflightState(entry) {
  if (!entry) return 'missing';
  if (entry.needsAuth || entry.status === 'unauthorized') return 'auth';
  if (entry.status === 'connecting') return 'recovering';
  if (entry.status !== 'connected') return 'transport';
  return 'ready';
}

module.exports = { createConnectingEntry, snapshotClientEntry, snapshotClientEntries, createToolEntry, classifyPreflightState };
