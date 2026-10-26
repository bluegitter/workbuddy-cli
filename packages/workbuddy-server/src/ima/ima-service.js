'use strict';
const { ImaAuthApi } = require('./api/auth-api');
const { ImaKnowledgeBaseApi } = require('./api/kb-api');
const { ImaFilesApi } = require('./api/files-api');
const { ImaAuthEventEmitter, ImaUploadEventEmitter } = require('./auth-event-emitter');
class ImaService {
  constructor(options) { this.auth = new ImaAuthApi(options.client, { productManager: options.productManager, authenticationManager: options.authenticationManager, fetchFn: options.fetchFn }); this.kb = new ImaKnowledgeBaseApi(options.client); this.files = new ImaFilesApi(options.client, { fetchFn: options.fetchFn }); this.authEvents = new ImaAuthEventEmitter(); this.uploadEvents = new ImaUploadEventEmitter(); }
  onAuthChanged(callback) { return this.authEvents.on(callback); }
  notifyAuthChanged(value) { this.authEvents.emit(value); }
  getLastAuthState() { return this.authEvents.getLast(); }
  onUploadProgress(callback) { return this.uploadEvents.on(callback); }
  notifyUploadProgress(payload) { this.uploadEvents.emit(payload); }
  dispose() { this.authEvents.dispose(); this.uploadEvents.dispose(); }
}
module.exports = { ImaService };
