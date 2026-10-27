'use strict';

const POLICY_VIEW_CACHE_TTL_MS = 60_000;
function shouldForceCosExpertSource(env = process.env) { return env.WORKBUDDY_EXPERT_MARKET_SOURCE?.trim().toLowerCase() === 'cos'; }

class ExpertDesktopService {
  constructor(deps = {}) { this.base = deps.baseService || deps.service; this.http = deps.http || deps.context?.http; this.policyCache = new Map(); this.policyInflight = new Map(); }
  mapMarketItem(item = {}) { const mapped = this.base?.mapMarketItem ? this.base.mapMarketItem(item) : { ...item, id: item.id || item.expert_id }; return item.source !== 'custom' && item.source_id ? { ...mapped, id: item.source_id } : mapped; }
  async _fetchPolicyView(enterpriseId) { if (!enterpriseId) return { disabled: new Set(), allowMode: false, allow: new Set() }; const cached = this.policyCache.get(enterpriseId); if (cached && Date.now() < cached.expiresAt) return cached.view; if (this.policyInflight.has(enterpriseId)) return this.policyInflight.get(enterpriseId); const promise = Promise.resolve(this.base?.getMarketExperts?.({ enterpriseId, source: 'builtin', page: 1, page_size: 1 })).then((result) => { const view = { disabled: new Set(result?.disabledSourceIds || []), allowMode: result?.allowMode === true, allow: new Set(result?.allowSourceIds || []) }; this.policyCache.set(enterpriseId, { view, expiresAt: Date.now() + POLICY_VIEW_CACHE_TTL_MS }); return view; }).catch(() => ({ disabled: new Set(), allowMode: false, allow: new Set() })); this.policyInflight.set(enterpriseId, promise); try { return await promise; } finally { this.policyInflight.delete(enterpriseId); } }
  async applyPolicyView(result, enterpriseId) { const view = await this._fetchPolicyView(enterpriseId); if (view.allowMode) return { ...result, experts: (result.experts || []).filter((expert) => view.allow.has(expert.sourceId || expert.id)) }; return view.disabled.size ? { ...result, experts: (result.experts || []).filter((expert) => !view.disabled.has(expert.sourceId || expert.id)) } : result; }
  getCategories(params) { return this.base?.getCategories?.(params); }
  getExperts(params) { return this.base?.getExperts?.(params); }
  getExpert(params) { return this.base?.getExpert?.(params); }
  refresh(params) { return this.base?.refresh?.(params); }
  getMarketExperts(params) { return this.base?.getMarketExperts?.(params); }
  getRanking(params) { return this.base?.getRanking?.(params); }
  getRecent(params) { return this.base?.getRecent?.(params); }
  addRecent(params) { return this.base?.addRecent?.(params); }
  removeRecent(params) { return this.base?.removeRecent?.(params); }
  clearRecent(params) { return this.base?.clearRecent?.(params); }
}

module.exports = Object.freeze({ POLICY_VIEW_CACHE_TTL_MS, shouldForceCosExpertSource, ExpertDesktopService });
