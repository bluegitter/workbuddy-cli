'use strict';

const CommodityCode = Object.freeze({
  free: 'TCACA_code_001_PqouKr6QWV', proMon: 'TCACA_code_002_AkiJS3ZHF5', proMonPlus: 'TCACA_code_005_maRGyrHhw1', gift: 'TCACA_code_006_DbXS0lrypC', activity: 'TCACA_code_007_nzdH5h4Nl0', proYear: 'TCACA_code_003_FAnt7lcmRT', freeMon: 'TCACA_code_008_cfWoLwvjU4', extra: 'TCACA_code_009_0XmEQc2xOf', youth: 'TCACA_code_023_4xbGhMrE6q', advanced: 'TCACA_code_026_BaESVICNoi', flagship: 'TCACA_code_027_0FCGVA6vSa', bonus28: 'TCACA_code_028_NtpWi0jzXs', bonus29: 'TCACA_code_029_6wCGEWquYy', bonus30: 'TCACA_code_030_BjSt89qTvr', extra38: 'TCACA_code_038_OhvqZtiPKr',
});
const AccountStatus = Object.freeze({ valid: 0, refund: 1, expired: 2, usedUp: 3 });
const WxaQrcodeSceneTypes = Object.freeze({ SHARE_CONTENT: 'share-content', SHARE_TRANSIT: 'share-transit' });
const CommodityCodeText = Object.freeze({ [CommodityCode.free]: 'plan.codebuddyFreePlan', [CommodityCode.proMon]: 'plan.codebuddyProPlanMonthly', [CommodityCode.proMonPlus]: 'plan.codebuddyProPlanMonthly', [CommodityCode.gift]: 'plan.codebuddyProPlanTrial', [CommodityCode.activity]: 'plan.codebuddyGrowthPlan', [CommodityCode.proYear]: 'plan.codebuddyProPlanYearly', [CommodityCode.freeMon]: 'plan.codebuddyProPlanDaily', [CommodityCode.extra]: 'plan.codebuddyCreditPackage', [CommodityCode.youth]: 'plan.codebuddyYouthPlan', [CommodityCode.advanced]: 'plan.codebuddyAdvancedPlan', [CommodityCode.flagship]: 'plan.codebuddyFlagshipPlan', [CommodityCode.bonus28]: 'plan.codebuddyBonus28Plan', [CommodityCode.bonus29]: 'plan.codebuddyBonus29Plan', [CommodityCode.bonus30]: 'plan.codebuddyBonus30Plan', [CommodityCode.extra38]: 'plan.codebuddyCreditPackage' });
function getPackageName(packageCode) { return CommodityCodeText[packageCode] || ''; }

module.exports = Object.freeze({ CommodityCode, AccountStatus, WxaQrcodeSceneTypes, CommodityCodeText, getPackageName });
