'use strict';

/**
 * Enterprise skill market client.
 *
 * The enterprise market and the user-asset API expose different response
 * shapes, so this adapter keeps their normalization in one place. The list,
 * category, and update-probe requests deliberately treat 4xx responses as a
 * soft failure: an unavailable enterprise endpoint must not reset the other
 * skill markets through the global auth interceptor.
 */

const SKILL_MARKET_PREFIX = '/v2/enterprises';
const USER_ASSET_SKILL_PREFIX = '/v2/user-asset/skill';
const DEFAULT_LIST_MARKET_PREFIX = SKILL_MARKET_PREFIX;
const SUBMITTED_FROM_HEADER = Object.freeze({ 'X-Submitted-From': 'web' });
const DEFAULT_PAGE_SIZE = 50;
const ALLOW_4XX_AS_SOFT_FAILURE = Object.freeze({
  validateStatus: (status) => status >= 200 && status < 500,
});

function mapRawItemToSkill(raw = {}) {
  return {
    id: raw.skill_id ?? raw.id ?? '',
    source: raw.source ?? 'custom',
    name: raw.name ?? '',
    icon_url: raw.icon_url ?? raw.icon,
    display_name_zh: raw.display_name_zh,
    display_name_en: raw.display_name_en,
    description_zh: raw.description_zh,
    description_en: raw.description_en,
    category_id: raw.category_id,
    category_name: raw.category_name,
    categories: raw.categories,
    download_url: raw.download_url,
    version: raw.version,
    updated_at: raw.updated_at,
  };
}

function unwrapUserAssetEnvelope(raw) {
  if (raw && typeof raw.code === 'number') return raw;
  if (raw?.data && typeof raw.data.code === 'number') return raw.data;
  return raw ?? {};
}

function ensureEnterpriseId(enterpriseId) {
  if (!enterpriseId) throw new Error('[CloudEnterpriseSkillsRepo] enterpriseId is required');
  return enterpriseId;
}

function buildBaseUrl(enterpriseId) {
  return `${SKILL_MARKET_PREFIX}/${encodeURIComponent(enterpriseId)}/skill-market`;
}

function mapUserAssetToInstalledMeta(item = {}) {
  return {
    skillId: item.asset_id ?? item.skill_id ?? '',
    version: item.version ?? '',
    name: item.display_name_zh || item.display_name || item.name || item.skill_id || item.asset_id,
    userModified: false,
    latestVersion: item.latest_published_version ?? '',
  };
}

class CloudEnterpriseSkillsRepo {
  constructor(deps = {}) {
    this.http = deps.context?.http;
    this.logger = deps.context?.logger;
    this.listMarketPrefix = deps.listMarketPrefix ?? DEFAULT_LIST_MARKET_PREFIX;
  }

  buildListBaseUrl(enterpriseId) {
    return `${this.listMarketPrefix}/${encodeURIComponent(enterpriseId)}/skill-market`;
  }

  async list(params = {}) {
    const enterpriseId = ensureEnterpriseId(params.enterpriseId);
    const query = new URLSearchParams({
      source: 'custom',
      page: String(params.page ?? 1),
      page_size: String(params.pageSize ?? DEFAULT_PAGE_SIZE),
    });
    if (params.keyword) query.set('keyword', params.keyword);

    const category = (params.categories ?? []).find(
      (value) => value !== undefined && value !== null && String(value).trim() !== '',
    );
    if (category !== undefined) {
      const categoryId = Number(category);
      if (Number.isFinite(categoryId) && categoryId > 0) query.set('category_id', String(categoryId));
    }

    const response = await this.http.get(
      `${this.buildListBaseUrl(enterpriseId)}/list?${query.toString()}`,
      ALLOW_4XX_AS_SOFT_FAILURE,
    );
    const payload = response?.data ?? response;
    const rawItems = payload?.items ?? payload?.skills ?? [];
    return {
      total_count: payload?.total ?? payload?.total_count ?? rawItems.length,
      skills: rawItems.map(mapRawItemToSkill),
    };
  }

  async getCategories(params = {}) {
    const enterpriseId = ensureEnterpriseId(params.enterpriseId);
    const response = await this.http.get(
      `${buildBaseUrl(enterpriseId)}/custom-categories`,
      ALLOW_4XX_AS_SOFT_FAILURE,
    );
    return { items: (response?.data ?? response)?.items ?? [] };
  }

  async probeVisibility(params = {}) {
    try {
      const result = await this.list({ enterpriseId: params.enterpriseId, page: 1, pageSize: 1 });
      const total = result.total_count ?? 0;
      return { visible: total > 0, total };
    } catch (error) {
      this.logger?.warn?.(
        '[CloudEnterpriseSkillsRepo] probeVisibility failed',
        error instanceof Error ? error.message : String(error),
      );
      return { visible: false, total: 0 };
    }
  }

  async install(params = {}) {
    if (!params.skillId) {
      return { success: false, skillName: params.name, errorMessage: 'skillId is empty' };
    }
    try {
      const response = unwrapUserAssetEnvelope(await this.http.post(
        `${USER_ASSET_SKILL_PREFIX}/install`,
        { items: [{ source: 'enterprise', asset_id: params.skillId, version: params.version ?? '' }] },
        { headers: SUBMITTED_FROM_HEADER },
      ));
      if (response?.code !== 0) {
        return {
          success: false,
          skillName: params.name ?? params.skillId,
          errorMessage: response?.msg || `install failed (code=${response?.code})`,
        };
      }
      return { success: true, skillName: params.name ?? params.skillId };
    } catch (error) {
      return {
        success: false,
        skillName: params.name ?? params.skillId,
        errorMessage: error instanceof Error ? error.message : 'install failed',
      };
    }
  }

  async getInstalledMetas() {
    try {
      return (await this.fetchAllEnterpriseAssets()).map(mapUserAssetToInstalledMeta);
    } catch (error) {
      console.warn('[EnterpriseSkillsDomain] getInstalledMetas failed:', String(error));
      return [];
    }
  }

  async getByIds(params = {}) {
    if (!params.ids?.length) return { total_count: 0, skills: [] };
    const enterpriseId = ensureEnterpriseId(params.enterpriseId);
    try {
      const response = await this.http.post(
        `${buildBaseUrl(enterpriseId)}/get-by-ids`,
        { skills: params.ids.map((id) => ({ id, source: 'custom' })) },
        ALLOW_4XX_AS_SOFT_FAILURE,
      );
      const payload = response?.data ?? response;
      const rawItems = payload?.items ?? payload?.skills ?? [];
      return {
        total_count: payload?.total ?? payload?.total_count ?? rawItems.length,
        skills: rawItems.map(mapRawItemToSkill),
      };
    } catch (error) {
      console.warn('[EnterpriseSkillsDomain] getByIds failed:', String(error));
      return { total_count: 0, skills: [] };
    }
  }

  async fetchAllEnterpriseAssets() {
    const pageSize = 100;
    const firstPage = await this.fetchAssetPage(1, pageSize);
    if (!firstPage?.data?.items) return [];

    let items = [...firstPage.data.items];
    const totalPages = Math.ceil((firstPage.data.total ?? items.length) / pageSize);
    if (totalPages > 1) {
      const pages = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) => this.fetchAssetPage(index + 2, pageSize)),
      );
      for (const page of pages) if (page.data?.items) items = items.concat(page.data.items);
    }
    return items;
  }

  async fetchAssetPage(pageNo, pageSize) {
    const query = `?source=enterprise&page_no=${pageNo}&page_size=${pageSize}`;
    return unwrapUserAssetEnvelope(await this.http.get(
      `${USER_ASSET_SKILL_PREFIX}/get-list${query}`,
      { headers: SUBMITTED_FROM_HEADER, ...ALLOW_4XX_AS_SOFT_FAILURE },
    ));
  }
}

module.exports = Object.freeze({
  ALLOW_4XX_AS_SOFT_FAILURE,
  CloudEnterpriseSkillsRepo,
  DEFAULT_LIST_MARKET_PREFIX,
  DEFAULT_PAGE_SIZE,
  SKILL_MARKET_PREFIX,
  SUBMITTED_FROM_HEADER,
  USER_ASSET_SKILL_PREFIX,
  buildBaseUrl,
  ensureEnterpriseId,
  mapRawItemToSkill,
  mapUserAssetToInstalledMeta,
  unwrapUserAssetEnvelope,
});
