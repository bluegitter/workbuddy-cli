'use strict';
function normalizeCloudAgentListItem(item) { if (item.manifest && !item.currentVersion?.manifest) return { ...item, currentVersion: { ...item.currentVersion, manifest: item.manifest } }; return item; }
module.exports = Object.freeze({ normalizeCloudAgentListItem });
