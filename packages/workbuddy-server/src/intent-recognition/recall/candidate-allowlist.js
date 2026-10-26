'use strict';

const SKILL_NAME_ALLOWLIST = new Set(['3D模型与视频特效', 'cloudstudio-deploy', 'expert-manager']);
const PLUGIN_NAME_ALLOWLIST = new Set();
const CONNECTOR_ID_ALLOWLIST = new Set([
  'tdx-connector', 'qq-mail', 'tencent-docs', 'tmeet', 'cnb-woa', 'wecom', 'pkulaw', 'tyc-mcp',
  'westock-mcp', 'lexiang', 'tencent-docs-oa', 'tapd-woa', 'iwiki-woa', 'tencent-recruitment',
  'tencent-survey', 'km', 'ctrip-wendao', 'netease-mail', 'notion', 'xiaoe-cloud-cli',
  'tencent-health-nges', 'github', 'cloudbase', 'yuandian-mcp', 'tencentads', 'tencent-map', 'fyopen-lawsearch'
]);

const isSkillAllowed = (name) => SKILL_NAME_ALLOWLIST.has(name);
const isPluginAllowed = (name) => PLUGIN_NAME_ALLOWLIST.has(name);
const isConnectorAllowed = (id) => CONNECTOR_ID_ALLOWLIST.has(id);

module.exports = Object.freeze({ SKILL_NAME_ALLOWLIST, PLUGIN_NAME_ALLOWLIST, CONNECTOR_ID_ALLOWLIST, isSkillAllowed, isPluginAllowed, isConnectorAllowed });
