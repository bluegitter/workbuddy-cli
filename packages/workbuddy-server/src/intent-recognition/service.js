'use strict';
const { IntentRecognitionServiceToken } = require('./protocol');
const EMPTY_RESULT = Object.freeze({ skills: [], plugins: [], connectors: [] });
class IntentRecognitionService {
  constructor() { this.readEnabledFlag = undefined; this.recallService = undefined; }
  setRecallService(recall) { this.recallService = recall; }
  setEnabledResolver(resolver) { this.readEnabledFlag = resolver; }
  async searchSuggestedForQuery(query, topK) { if (this.readEnabledFlag && !this.readEnabledFlag()) return EMPTY_RESULT; if (!this.recallService) return EMPTY_RESULT; await this.recallService.invalidateAndWait('skill'); return this.recallService.searchSuggested(query, topK); }
  invalidateRecall(kind) { this.recallService?.invalidate(kind); }
}
module.exports = Object.freeze({ IntentRecognitionService, IntentRecognitionServiceToken, EMPTY_RESULT });
