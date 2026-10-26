'use strict';

const { registerServiceHandlers } = require('../server/service-handlers');

function createCapabilityMissingSkillSnapshot() {
  return { allowed: true, mode: 'all', max_size_bytes: 0, require_review: false, source: 'capability-missing', fetchedAt: Date.now() };
}
function normalizeDesktopSkillUploadPolicySnapshot(snapshot = {}) {
  const { policy_mode: ignored, ...rest } = snapshot;
  return { ...rest, mode: snapshot.mode ?? snapshot.policy_mode ?? 'all', max_size_bytes: 0, require_review: snapshot.require_review ?? false };
}
function createCapabilityMissingModelSnapshot() {
  return { allowed: true, policy_mode: 'all', source: 'capability-missing', fetchedAt: Date.now() };
}
function registerEnterprisePolicyHandlers(registry, service) { return registerServiceHandlers(registry, 'enterprisePolicy', service); }
function registerEnterprisePolicyRuntimeHandlers(registry, deps = {}) {
  const logger = deps.logger || console;
  Promise.resolve(deps.cellDeps).then((cellDeps = {}) => registerEnterprisePolicyHandlers(registry, {
    getSkillUploadPolicy: () => cellDeps.skillUploadPolicyService?.getPolicy().then(normalizeDesktopSkillUploadPolicySnapshot) ?? Promise.resolve(createCapabilityMissingSkillSnapshot()),
    refreshSkillUploadPolicy: () => cellDeps.skillUploadPolicyService?.getPolicy({ forceRefresh: true }).then(normalizeDesktopSkillUploadPolicySnapshot) ?? Promise.resolve(createCapabilityMissingSkillSnapshot()),
    getMemberCustomModelPolicy: () => cellDeps.memberCustomModelPolicyService?.getPolicy() ?? Promise.resolve(createCapabilityMissingModelSnapshot()),
    refreshMemberCustomModelPolicy: () => cellDeps.memberCustomModelPolicyService?.getPolicy({ forceRefresh: true }) ?? Promise.resolve(createCapabilityMissingModelSnapshot()),
  })).catch((error) => logger.error?.('[EnterprisePolicyService] registration failed:', String(error)));
}

module.exports = { createCapabilityMissingSkillSnapshot, normalizeDesktopSkillUploadPolicySnapshot, createCapabilityMissingModelSnapshot, registerEnterprisePolicyHandlers, registerEnterprisePolicyRuntimeHandlers };
