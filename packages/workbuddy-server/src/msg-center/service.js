'use strict';

const DEFAULT_ROUTE_PREFIX = '/portal/msg-center/message';

function unwrap(response, operation, logger = console) {
  if (typeof response?.code === 'number' && response.code !== 0) {
    logger.warn(`[MsgCenterService] ${operation} failed: code=${response.code} msg=${response.msg}`);
    return null;
  }
  return response?.data ?? null;
}

class MsgCenterService {
  constructor(deps = {}) {
    this.http = deps.context?.http || deps.http;
    this.prefix = deps.routePrefix || DEFAULT_ROUTE_PREFIX;
    this.logger = deps.logger || console;
    this.productHeaders = { headers: { 'X-Product-Code': 'workbuddy' } };
  }

  async request(operation, action) {
    try { return unwrap(await action(), operation, this.logger); }
    catch (error) { this.logger.warn(`[MsgCenterService] ${operation} error:`, error); return null; }
  }
  getSummary() { return this.request('getSummary', () => this.http.get(`${this.prefix}/summary`, this.productHeaders)); }
  getList(cursor, limit) { const query = new URLSearchParams(); if (cursor) query.set('cursor', cursor); if (limit != null) query.set('limit', String(limit)); const suffix = query.toString() ? `?${query}` : ''; return this.request('getList', () => this.http.get(`${this.prefix}/list${suffix}`, this.productHeaders)); }
  markRead(params) { return this.request('markRead', () => this.http.post(`${this.prefix}/read`, params, this.productHeaders)); }
  getPendingDisplays(params) { const body = {}; if (params?.display?.length) body.display = params.display; if (params?.limit != null) body.limit = params.limit; return this.request('getPendingDisplays', () => this.http.post(`${this.prefix}/pending-displays/refresh`, body, this.productHeaders)); }
  notifyShown(params) { return this.request('notifyShown', () => this.http.post(`${this.prefix}/notify-shown`, params, this.productHeaders)); }
  deleteMessage(msgId) { return this.request('deleteMessage', () => this.http.post(`${this.prefix}/delete`, { msg_id: msgId }, this.productHeaders)); }
  updateExt(params) { return this.request('updateExt', () => this.http.post(`${this.prefix}/ext`, params, this.productHeaders)); }
  updateUserExt(params) { return this.request('updateUserExt', () => this.http.post(`${this.prefix}/update`, params, this.productHeaders)); }
  getCursor() { return this.request('getCursor', () => this.http.get(`${this.prefix}/cursor`, this.productHeaders)); }
  async executeCallbackAction(actionUrl) { try { await this.http.post(actionUrl.replace(/^api:\/\//, ''), {}, this.productHeaders); } catch (error) { this.logger.warn('[MsgCenterService] executeCallbackAction error:', error); } }
}

module.exports = { MsgCenterService, unwrap, DEFAULT_ROUTE_PREFIX };
