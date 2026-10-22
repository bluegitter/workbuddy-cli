'use strict';

const DEFAULT_ENTERPRISE_VARIANT_KEY = 'enterprise';
const VPC_ENTERPRISE_VARIANT_KEY = 'enterprise:vpc';
const IOA_ENTERPRISE_IDS = new Set(['etahzsqej0n4', 'esoikz80kd8g']);

function isIOAEnterprise(enterpriseId) { return IOA_ENTERPRISE_IDS.has(enterpriseId); }

function deriveAccountContext(options = {}) {
  const userId = options.userId?.trim() || 'default';
  const enterpriseId = options.enterpriseId?.trim() || '';
  const accountType = options.accountType?.trim() || (enterpriseId ? 'ultimate' : 'personal');
  const isVPCAccount = accountType === 'exclusive';
  const isEnterpriseAccount = accountType === 'ultimate' || isVPCAccount || (!options.accountType && Boolean(enterpriseId));
  return {
    userId,
    enterpriseId,
    accountType,
    kind: isEnterpriseAccount ? 'enterprise' : 'personal',
    deploymentKind: isVPCAccount ? 'vpc' : isEnterpriseAccount ? 'enterprise' : 'personal',
    variantKey: isVPCAccount ? VPC_ENTERPRISE_VARIANT_KEY : DEFAULT_ENTERPRISE_VARIANT_KEY,
  };
}

module.exports = { DEFAULT_ENTERPRISE_VARIANT_KEY, VPC_ENTERPRISE_VARIANT_KEY, deriveAccountContext, isIOAEnterprise };
