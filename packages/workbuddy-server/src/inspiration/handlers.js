'use strict';

const TAG = '[InspirationHandlers]';
function register(registry, name, handler) { if (typeof registry.handle === 'function') registry.handle(name, handler); else if (typeof registry.register === 'function') registry.register(name, handler); else throw new Error('RPC registry does not support handle/register'); }
function registerInspirationHandlers(registry, deps) {
  const services = Promise.resolve(deps.services); const logger = deps.logger ?? console; const getService = async () => (await services).inspiration;
  const methods = {
    inspirationList: ['list', { cards: [], total: 0, hasMore: false }], inspirationDetail: ['getCard', null], inspirationSettingsGet: ['getSettings', null], inspirationSettingsSave: ['saveSettings', { success: false }], inspirationOnboardingCheck: ['checkOnboarding', { completed: false }], inspirationOnboardingComplete: ['completeOnboarding', { success: false }], inspirationFeedback: ['submitFeedback', { success: false }], inspirationMarkRead: ['markRead', { success: false }], inspirationMarkAllRead: ['markAllRead', { success: false }], inspirationSave: ['saveCard', { success: false }], inspirationRecordTabView: ['recordTabView', { success: false }], inspirationInjectDemo: ['injectDemoCards', { success: false }], inspirationCurationList: ['listCurationDirectives', []], inspirationCurationAdd: ['addCurationDirective', null], inspirationCurationUpdate: ['updateCurationDirective', { success: false }], inspirationCurationDelete: ['deleteCurationDirective', { success: false }],
  };
  for (const [rpcName, [method, fallback]] of Object.entries(methods)) register(registry, rpcName, async (params) => { try { return await (await getService())[method](params); } catch (error) { logger.error?.(`${TAG} ${rpcName} failed:`, String(error)); return fallback; } });
  return registry;
}
module.exports = Object.freeze({ TAG, registerInspirationHandlers });
