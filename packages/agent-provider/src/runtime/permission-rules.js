'use strict';

function parsePermissionRule(value) {
  const source = String(value || '').trim();
  const open = findUnescaped(source, '(');
  if (open < 0) return { toolName: normalizeToolName(source) };
  const close = findLastUnescaped(source, ')');
  if (close !== source.length - 1 || close <= open) return { toolName: normalizeToolName(source) };
  const toolName = source.slice(0, open).trim();
  const rawContent = source.slice(open + 1, close);
  if (!toolName || rawContent === '' || rawContent === '*') return { toolName: normalizeToolName(toolName || source) };
  return { toolName: normalizeToolName(toolName), ruleContent: rawContent.replace(/\\([()\\])/g, '$1') };
}

function normalizeToolName(name) {
  const value = String(name || '').trim();
  return value === 'bash' ? 'Bash' : value === 'powershell' ? 'PowerShell' : value;
}

function ruleMatches(rule, toolName, input) {
  const value = typeof rule === 'string' ? parsePermissionRule(rule) : rule?.ruleValue || rule;
  if (!value || normalizeToolName(value.toolName) !== normalizeToolName(toolName)) return false;
  if (value.ruleContent === undefined) return true;
  const content = typeof input === 'string' ? input : extractRuleContent(input);
  return wildcardMatch(value.ruleContent, content);
}

function evaluatePermissionRules(rules, toolName, input) {
  const matching = (rules || []).filter((rule) => ruleMatches(rule, toolName, input));
  if (matching.length === 0) return undefined;
  const selected = matching[matching.length - 1];
  const behavior = selected.ruleBehavior || selected.behavior;
  return behavior ? { behavior, source: selected.source || 'rule', rule: selected } : undefined;
}

function extractRuleContent(input) {
  if (input == null) return '';
  if (typeof input === 'object') return input.command ?? input.cmd ?? input.script ?? input.prompt ?? input.path ?? input.value ?? JSON.stringify(input);
  return String(input);
}

function wildcardMatch(pattern, value) {
  const expression = String(pattern).split('*').map(escapeRegex).join('.*');
  return new RegExp(`^${expression}$`, 's').test(String(value ?? ''));
}

function escapeRegex(value) { return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&'); }
function findUnescaped(value, character) { for (let i = 0; i < value.length; i += 1) if (value[i] === character && !isEscaped(value, i)) return i; return -1; }
function findLastUnescaped(value, character) { for (let i = value.length - 1; i >= 0; i -= 1) if (value[i] === character && !isEscaped(value, i)) return i; return -1; }
function isEscaped(value, index) { let count = 0; for (let i = index - 1; i >= 0 && value[i] === '\\'; i -= 1) count += 1; return count % 2 === 1; }

module.exports = { parsePermissionRule, ruleMatches, evaluatePermissionRules, wildcardMatch };
