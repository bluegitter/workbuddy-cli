'use strict';
const KEY_BASE = 'securityCenter.audit.config';
function listAuditMessage(label, config, listName, prefix, clearedSpecialKey) {
  if (config === null) return { messageKey: `${prefix}.reset`, messageParams: { listLabelKey: label } };
  const count = config?.[listName]?.length;
  if (count === undefined) return { messageKey: `${prefix}.updatedNoCount`, messageParams: { listLabelKey: label } };
  if (count === 0) return { messageKey: clearedSpecialKey || `${prefix}.cleared`, messageParams: clearedSpecialKey ? {} : { listLabelKey: label } };
  return { messageKey: `${prefix}.updatedWithCount`, messageParams: { listLabelKey: label, count } };
}
const commandSafetyListAuditMessage = (label, config, name, prefix) => listAuditMessage(label, config, name, prefix);
const fileSafetyListAuditMessage = (label, config, name, prefix, cleared) => listAuditMessage(label, config, name, prefix, cleared);
function sandboxRulesAuditMessage(action, payload) {
  if (action === 'denyAll') return { messageKey: `${KEY_BASE}.denyAll${payload?.denyAll ? 'On' : 'Off'}`, messageParams: {} };
  if (action === 'allowedDomains') return { messageKey: `${KEY_BASE}.allowedDomainsUpdated`, messageParams: {} };
  if (action === 'deniedDomains') return { messageKey: `${KEY_BASE}.deniedDomainsUpdated`, messageParams: {} };
  if (action === 'commandSafetyAsk') return commandSafetyListAuditMessage(`${KEY_BASE}.labels.commandSafetyAsk`, payload?.commandSafety, 'ask', `${KEY_BASE}.commandSafetyAsk`);
  if (action === 'commandSafetyAllow') return commandSafetyListAuditMessage(`${KEY_BASE}.labels.commandSafetyAllow`, payload?.commandSafety, 'allow', `${KEY_BASE}.commandSafetyAllow`);
  if (action === 'fileSafetyAllowlist') return fileSafetyListAuditMessage(`${KEY_BASE}.labels.fileSafetyAllowlist`, payload?.fileSafety, 'allowlist', `${KEY_BASE}.fileSafetyAllowlist`, `${KEY_BASE}.fileSafetyAllowlist.clearedSpecial`);
  if (action === 'fileSafetyBlocklist') return fileSafetyListAuditMessage(`${KEY_BASE}.labels.fileSafetyBlocklist`, payload?.fileSafety, 'blocklist', `${KEY_BASE}.fileSafetyBlocklist`);
  return { messageKey: `${KEY_BASE}.sandboxRulesUpdated`, messageParams: {} };
}
module.exports = Object.freeze({ KEY_BASE, listAuditMessage, commandSafetyListAuditMessage, fileSafetyListAuditMessage, sandboxRulesAuditMessage });
