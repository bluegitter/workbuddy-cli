'use strict';

const DEFAULT_ENTERPRISE_VARIANT_KEY = 'enterprise';
const VPC_ENTERPRISE_VARIANT_KEY = 'enterprise:vpc';
const ONEID_TOKEN_HEADER_NAME = 'X-Oneid-Access-Token';
const TENCENT_DOCS_ONEID_APP_TYPE = 'doc';
const TENCENT_DOCS_B_END_CONNECTOR_ID = 'tencent-docs-oa';

const CRAFT_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task'];
const MODE_TOOLS_CONFIG = Object.freeze({
  craft: CRAFT_TOOLS.join(','),
  ask: ['Read', 'AskUserQuestion', 'WebFetch', 'WebSearch', 'Glob', 'Grep'].join(','),
  plan: [...CRAFT_TOOLS, 'EnterPlanMode', 'ExitPlanMode'].join(','),
  expert: [...CRAFT_TOOLS, 'EnterPlanMode', 'ExitPlanMode'].join(','),
});

function resolveModeTools(mode) { return MODE_TOOLS_CONFIG[mode] || MODE_TOOLS_CONFIG.craft; }
function resolveActiveEnterpriseVariant(entry, context = {}) { return entry && context.kind === 'enterprise' ? entry.enterprise_variants?.[context.variantKey] || entry.enterprise_variant : undefined; }
function resolveRawAuthMode(entry, context) { return resolveActiveEnterpriseVariant(entry, context)?.auth_mode || entry?.auth_mode; }
function normalizeAuthMode(mode) { return mode === 'oneid-token' ? 'server-side' : mode; }
function isOneidTokenAuthMode(mode) { return mode === 'oneid-token'; }
function getEnterpriseFallbackTokenHeaderName(entry) { return (entry?.source || entry?.name) === 'lexiang' || entry?.provider_id === 'lexiang' ? ONEID_TOKEN_HEADER_NAME : undefined; }
function resolveActiveAuthMode(entry, context) { return normalizeAuthMode(resolveRawAuthMode(entry, context)); }
function resolveTokenHeaderName(entry, context) {
  const variant = resolveActiveEnterpriseVariant(entry, context);
  return variant?.token_header?.name || getEnterpriseFallbackTokenHeaderName(entry) || (isOneidTokenAuthMode(resolveRawAuthMode(entry, context)) ? ONEID_TOKEN_HEADER_NAME : undefined);
}
function resolveOneidAppType(entry, context) { return resolveActiveEnterpriseVariant(entry, context)?.oneid_app_type || entry?.oneid_app_type || ((entry?.source || entry?.name) === TENCENT_DOCS_B_END_CONNECTOR_ID ? TENCENT_DOCS_ONEID_APP_TYPE : undefined); }
function resolveResponseLocaleIsZh(configured, systemLocale) { return String(configured || systemLocale || '').trim().toLowerCase().startsWith('zh'); }
function isEnterpriseManagedOneidConnector(entry, context) { return context.kind === 'enterprise' && isOneidTokenAuthMode(resolveRawAuthMode(entry, context)); }

module.exports = Object.freeze({ DEFAULT_ENTERPRISE_VARIANT_KEY, MODE_TOOLS_CONFIG, ONEID_TOKEN_HEADER_NAME, VPC_ENTERPRISE_VARIANT_KEY, getEnterpriseFallbackTokenHeaderName, isEnterpriseManagedOneidConnector, isOneidTokenAuthMode, normalizeAuthMode, resolveActiveAuthMode, resolveActiveEnterpriseVariant, resolveModeTools, resolveOneidAppType, resolveRawAuthMode, resolveResponseLocaleIsZh, resolveTokenHeaderName });
