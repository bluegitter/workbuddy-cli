'use strict';
const { registerServiceHandlers } = require('../server/service-handlers');
function registerPersonalSkillsHandlers(registry, deps) { const service = deps.service ?? deps.personalSkills; if (!service) throw new Error('personalSkills service is required'); registerServiceHandlers(registry, 'personalSkills', service); return registry; }
function registerPersonalSkillsRuntimeHandlers(registry, deps) { return Promise.resolve(deps.cellDeps).then((cellDeps) => registerPersonalSkillsHandlers(registry, { service: deps.createService?.(cellDeps, deps) })).catch((error) => { deps.logger?.error?.('[PersonalSkillsService] registration failed:', String(error)); }); }
module.exports = Object.freeze({ registerPersonalSkillsHandlers, registerPersonalSkillsRuntimeHandlers });
