'use strict';

const path = require('path');
const { readLocalMemoryFiles, writeUserCallName, writeAiName, writeSoulBody, writeMemoryBody, readNameFrom, resolveConfigDir, syncNameReferences } = require('./local-memory-files');

function createWorkbuddyIdentityService({ identityServiceRef = { current: undefined }, moderationService, configDir, logger = console } = {}) {
  const fallback = async (action, defaultValue) => { try { return await action(); } catch (error) { logger.warn?.('[IdentityService]', error); return defaultValue; } };
  return {
    async getIdentityName() { const service = identityServiceRef.current; return { name: await fallback(() => service?.readName?.(), undefined) }; },
    async updateIdentityName(name) { if (typeof name !== 'string' || !name.trim()) return { success: false, error: 'name must be a non-empty string' }; return fallback(async () => { const service = identityServiceRef.current; if (service?.writeName) await service.writeName(name); else await writeAiName(configDir, name); return { success: true }; }, { success: false, error: 'failed to update identity name' }); },
    async checkModeration(params = {}) { if (typeof params.text !== 'string') return { pass: false, error: 'text must be a string' }; return fallback(() => moderationService?.checkText?.({ text: params.text, scene: params.scene }), { pass: true }); },
    async getLocalMemoryFiles() { return fallback(() => readLocalMemoryFiles(configDir), { aiName: { exists: false, value: '' }, userCallName: { exists: false, value: '' }, soul: { exists: false, content: '' }, memory: { exists: false, content: '' } }); },
    async updateUserCallName(name) { if (typeof name !== 'string' || !name.trim()) return { success: false, error: 'name must be a non-empty string' }; return fallback(async () => { await writeUserCallName(configDir, name); return { success: true }; }, { success: false, error: 'failed to update user name' }); },
    async updateAiName(name) { if (typeof name !== 'string' || !name.trim()) return { success: false, error: 'name must be a non-empty string' }; return fallback(async () => { const oldName = await readNameFrom(path.join(resolveConfigDir(configDir), 'IDENTITY.md')); const service = identityServiceRef.current; if (service?.writeName) await service.writeName(name); else await writeAiName(configDir, name); await syncNameReferences(configDir, oldName, name); return { success: true }; }, { success: false, error: 'failed to update AI name' }); },
    async updateSoulBody(body) { if (typeof body !== 'string') return { success: false, error: 'body must be a string' }; return fallback(async () => { await writeSoulBody(configDir, body); return { success: true }; }, { success: false, error: 'failed to update soul' }); },
    async updateMemoryBody(body) { if (typeof body !== 'string') return { success: false, error: 'body must be a string' }; return fallback(async () => { await writeMemoryBody(configDir, body); return { success: true }; }, { success: false, error: 'failed to update memory' }); },
  };
}

module.exports = { createWorkbuddyIdentityService };
