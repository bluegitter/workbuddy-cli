'use strict';
function retentionPolicyToDays(policy) { switch (policy) { case 'days_30': return 30; case 'days_60': return 60; case 'days_90': return 90; default: return null; } }
module.exports = Object.freeze({ retentionPolicyToDays });
