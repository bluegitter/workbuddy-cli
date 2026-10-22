'use strict';

const { mergeExpertManifests } = require('./expert-manifest');

const SCOPED_MANIFEST_PATHS = ['/internalExpert.json', '/externalExpert.json'];

class ExpertCenterResourceLoader {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '';
    this.manifestPath = options.manifestPath || '/expert_center.json';
    this.download = { timeout: 30_000, maxRetries: 2, retryDelay: 500, batchConcurrency: 4, ...options.download };
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.buildUrl = options.buildUrl || ((value) => new URL(value, this.baseUrl).toString());
  }

  async fetchManifest() {
    const baseManifest = await this.fetchBaseManifest(this.buildUrl(this.manifestPath));
    const scoped = (await Promise.all(SCOPED_MANIFEST_PATHS.map((item) => this.fetchScopedManifestSafe(item)))).filter(Boolean);
    return scoped.length ? mergeExpertManifests(baseManifest, scoped) : baseManifest;
  }

  async fetchBaseManifest(url) {
    const response = await this.fetchWithTimeout(url);
    if (!response.ok) throw new Error(`Failed to fetch manifest: ${response.status}`);
    return response.json();
  }

  async fetchScopedManifestSafe(relativePath) {
    try {
      const response = await this.fetchWithTimeout(this.buildUrl(relativePath));
      return response.ok ? await response.json() : null;
    } catch { return null; }
  }

  async fetchPrompt(promptPath) {
    const url = this.buildUrl(promptPath);
    const response = await this.fetchWithTimeout(url);
    if (!response.ok) throw new Error(`Failed to fetch prompt: ${response.status} - ${url}`);
    return response.text();
  }

  async fetchPromptWithRetry(promptPath) {
    let lastError;
    for (let attempt = 0; attempt <= this.download.maxRetries; attempt += 1) {
      try { return await this.fetchPrompt(promptPath); } catch (error) {
        lastError = error;
        if (attempt < this.download.maxRetries) await this.sleep(this.download.retryDelay);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Failed to fetch prompt: ${promptPath}`);
  }

  async fetchPromptsBatch(tasks, onProgress) {
    const results = new Map(); const total = tasks.length;
    if (!total) { onProgress?.(0, 0, 0); return results; }
    let completed = 0; let failed = 0;
    for (let index = 0; index < tasks.length; index += this.download.batchConcurrency) {
      const batch = tasks.slice(index, index + this.download.batchConcurrency);
      const settled = await Promise.allSettled(batch.map(async (task) => ({ ...task, content: await this.fetchPromptWithRetry(task.path) })));
      for (const item of settled) {
        if (item.status === 'fulfilled') { const value = item.value; results.set(`${value.expertId}_${value.locale}`, value); completed += 1; }
        else failed += 1;
      }
      onProgress?.(completed, total, failed);
    }
    return results;
  }

  async fetchWithTimeout(url, timeout = this.download.timeout) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout); timer.unref?.();
    try { return await this.fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json, text/plain, text/markdown' } }); }
    catch (error) { if (error?.name === 'AbortError') throw new Error(`Request timeout after ${timeout}ms: ${url}`); throw error; }
    finally { clearTimeout(timer); }
  }
  sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
}

module.exports = { SCOPED_MANIFEST_PATHS, ExpertCenterResourceLoader };
