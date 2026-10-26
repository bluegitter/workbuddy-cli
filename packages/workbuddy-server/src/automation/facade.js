'use strict';

function createAutomationFacade(deps) {
  const unavailable = deps.createAutomationUnavailableResult ?? (() => ({ success: false, error: 'Automation service unavailable' }));
  const emptySnapshot = deps.createEmptyAutomationSnapshot ?? (() => ({ automations: [], inbox: [] }));
  const getService = () => deps.automationService?.service;
  const call = (method, ...args) => { const service = getService(); return service ? service[method](...args) : unavailable(); };
  return {
    archiveInboxItem: async (itemId) => call('archiveInboxItem', itemId),
    deleteAutomation: async (id) => call('deleteAutomation', id),
    deleteInboxItem: async (itemId) => call('deleteInboxItem', itemId),
    getSnapshot: async () => { const service = getService(); return service ? service.getSnapshot() : emptySnapshot(); },
    testAutomation: async (id) => call('testAutomation', id),
    updateFromTool: async (payload) => call('updateFromTool', payload),
  };
}

module.exports = Object.freeze({ createAutomationFacade });
