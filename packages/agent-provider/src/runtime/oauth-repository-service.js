'use strict';

class OAuthRepositoryService {
  constructor(options = {}) { this.http = options.http; this.logger = options.logger || console; }
  async getBranches(connector, params, page = 0, perPage = 100) {
    const query = this.buildBranchQueryParams(connector, params, page, perPage);
    const url = `/console/as/connector/oauth/${connector}/branches?${query}`;
    const response = await this.http.get(url);
    return response?.data ? response.data.branches || [] : [];
  }
  async getRepositories(connector, page = 0, perPage = 100) {
    const query = new URLSearchParams({ page: String(page), per_page: String(Math.min(perPage, 100)) });
    const response = await this.http.get(`/console/as/connector/oauth/${connector}/repos?${query}`);
    return response?.data || {};
  }
  buildBranchQueryParams(connector, params = {}, page, perPage) {
    const query = new URLSearchParams({ page: String(page), per_page: String(Math.min(perPage, 100)) });
    if (connector === 'github') { if (!params.owner || !params.repo) throw new Error('GitHub requires owner and repo parameters'); query.set('owner', params.owner); query.set('repo', params.repo); }
    else if (connector === 'gongfeng') { if (!params.project_id) throw new Error('Gongfeng requires project_id parameter'); query.set('project_id', params.project_id); }
    else if (connector === 'cnb') { if (!params.repo) throw new Error('CNB requires repo parameter'); query.set('repo', params.repo); }
    else throw new Error(`Unknown connector: ${connector}`);
    return query;
  }
  logRepositoryCounts(response) {
    if (response?.github_repos) this.logger.debug?.(`Retrieved ${Object.values(response.github_repos).reduce((sum, repos) => sum + repos.length, 0)} GitHub repos`);
    if (response?.gongfeng_repos) this.logger.debug?.(`Retrieved ${response.gongfeng_repos.length} Gongfeng repos`);
    if (response?.cnb_repos) this.logger.debug?.(`Retrieved ${response.cnb_repos.length} CNB repos`);
  }
}

module.exports = Object.freeze({ OAuthRepositoryService });
