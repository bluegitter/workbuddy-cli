'use strict';

const FILESYSTEM_METHODS = Object.freeze({
  READ: 'fs/read', WRITE: 'fs/write', LIST: 'fs/list', EXISTS: 'fs/exists',
  MAKE_DIR: 'fs/makeDir', REMOVE: 'fs/remove', RENAME: 'fs/rename', GET_INFO: 'fs/getInfo',
  WATCH_DIR: 'fs/watchDir', UNWATCH: 'fs/unwatch',
});
let watchIdCounter = 0;

class LocalFilesystem {
  constructor(client, sessionId, { debug = false } = {}) {
    this.client = client; this.sessionId = sessionId; this.debug = debug; this.watchCallbacks = new Map();
    const dispose = this.client.onExtNotification?.((method, params) => {
      if (method !== 'fs-event' || !params?.watchId) return;
      const callback = this.watchCallbacks.get(params.watchId);
      callback?.({ type: params.eventType, name: params.name, path: params.path });
    });
    this.eventCleanup = typeof dispose === 'function' ? dispose : undefined;
  }

  async sendRequest(method, params) {
    const result = await this.client.sendRequest(this.sessionId, method, params);
    if (result && typeof result === 'object') {
      if (result.error) throw new Error(result.error);
      if ('data' in result) return result.data;
    }
    return result;
  }

  async read(path, opts) {
    const format = opts?.format || 'text';
    if (format === 'text') return this.sendRequest(FILESYSTEM_METHODS.READ, { path, opts, format });
    const encoded = await this.sendRequest(FILESYSTEM_METHODS.READ, { path, opts, format: 'bytes' });
    const bytes = typeof encoded === 'string' ? Uint8Array.from(Buffer.from(encoded, 'base64')) : new Uint8Array(encoded);
    if (format === 'bytes') return bytes;
    if (format === 'blob') return new Blob([bytes]);
    return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
  }

  async write(pathOrFiles, dataOrOpts, opts) {
    if (Array.isArray(pathOrFiles)) {
      const files = await Promise.all(pathOrFiles.map(async (entry) => ({ path: entry.path, data: await this.convertDataToString(entry.data) })));
      return this.sendRequest(FILESYSTEM_METHODS.WRITE, { path: '', files, opts: dataOrOpts });
    }
    return this.sendRequest(FILESYSTEM_METHODS.WRITE, { path: pathOrFiles, data: await this.convertDataToString(dataOrOpts), opts });
  }

  list(path, opts) { return this.sendRequest(FILESYSTEM_METHODS.LIST, { path, opts, depth: opts?.depth }); }
  exists(path, opts) { return this.sendRequest(FILESYSTEM_METHODS.EXISTS, { path, opts }); }
  makeDir(path, opts) { return this.sendRequest(FILESYSTEM_METHODS.MAKE_DIR, { path, opts }); }
  async remove(path, opts) { await this.sendRequest(FILESYSTEM_METHODS.REMOVE, { path, opts }); }
  rename(path, newPath, opts) { return this.sendRequest(FILESYSTEM_METHODS.RENAME, { path, newPath, opts }); }
  getInfo(path, opts) { return this.sendRequest(FILESYSTEM_METHODS.GET_INFO, { path, opts }); }

  async watchDir(path, onEvent, opts) {
    const watchId = `watch-${++watchIdCounter}-${Date.now()}`;
    this.watchCallbacks.set(watchId, onEvent);
    try {
      await this.sendRequest(FILESYSTEM_METHODS.WATCH_DIR, { path, recursive: opts?.recursive, opts: { ...opts, user: watchId } });
    } catch (error) { this.watchCallbacks.delete(watchId); throw error; }
    return { stop: async () => { this.watchCallbacks.delete(watchId); try { await this.sendRequest(FILESYSTEM_METHODS.UNWATCH, { path, opts: { user: watchId } }); } finally { opts?.onExit?.(); } } };
  }

  async convertDataToString(data) {
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('base64');
    if (typeof Blob !== 'undefined' && data instanceof Blob) return Buffer.from(await data.arrayBuffer()).toString('base64');
    if (data && typeof data.getReader === 'function') {
      const reader = data.getReader(); const chunks = [];
      for (;;) { const item = await reader.read(); if (item.done) break; if (item.value) chunks.push(Buffer.from(item.value)); }
      return Buffer.concat(chunks).toString('base64');
    }
    return String(data);
  }

  destroy() { this.watchCallbacks.clear(); this.eventCleanup?.(); this.eventCleanup = undefined; }
}

module.exports = { FILESYSTEM_METHODS, LocalFilesystem };
