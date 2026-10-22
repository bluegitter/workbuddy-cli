'use strict';

class RequestError extends Error {
  constructor(code, message, data) { super(message); this.code = code; this.name = 'RequestError'; this.data = data; }
  static parseError(data, message) { return new RequestError(-32700, `Parse error${message ? `: ${message}` : ''}`, data); }
  static invalidRequest(data, message) { return new RequestError(-32600, `Invalid request${message ? `: ${message}` : ''}`, data); }
  static methodNotFound(method) { return new RequestError(-32601, `"Method not found": ${method}`, { method }); }
  static invalidParams(data, message) { return new RequestError(-32602, `Invalid params${message ? `: ${message}` : ''}`, data); }
  static internalError(data, message) { return new RequestError(-32603, `Internal error${message ? `: ${message}` : ''}`, data); }
  static authRequired(data, message) { return new RequestError(-32000, `Authentication required${message ? `: ${message}` : ''}`, data); }
  static resourceNotFound(uri) { return new RequestError(-32002, `Resource not found${uri ? `: ${uri}` : ''}`, uri ? { uri } : undefined); }
  toResult() { return { error: { code: this.code, message: this.message, data: this.data } }; }
  toErrorResponse() { return { code: this.code, message: this.message, data: this.data }; }
}

function rejectedPromise(error) { const promise = Promise.reject(error); promise.catch(() => {}); return promise; }

class RpcConnection {
  constructor(requestHandler, notificationHandler, stream) {
    this.requestHandler = requestHandler || (async () => { throw RequestError.methodNotFound('unknown'); });
    this.notificationHandler = notificationHandler || (async () => {});
    this.stream = stream;
    this.pendingResponses = new Map();
    this.nextRequestId = 0;
    this.writeQueue = Promise.resolve();
    this.abortController = new AbortController();
    this.closedPromise = new Promise((resolve) => this.abortController.signal.addEventListener('abort', resolve, { once: true }));
    this.receive();
  }
  get signal() { return this.abortController.signal; }
  get closed() { return this.closedPromise; }
  async receive() {
    let closeError;
    try {
      const reader = this.stream.readable.getReader();
      try {
        while (!this.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) await this.processMessage(value);
        }
      } finally { reader.releaseLock(); }
    } catch (error) { closeError = error; }
    finally { this.close(closeError); }
  }
  async processMessage(message) {
    if (message && message.method !== undefined && message.id !== undefined) {
      const response = await this.tryCallRequestHandler(message.method, message.params);
      await this.sendMessage({ jsonrpc: '2.0', id: message.id, ...response });
    } else if (message && message.method !== undefined) {
      await this.tryCallNotificationHandler(message.method, message.params);
    } else if (message && message.id !== undefined) this.handleResponse(message);
    else throw RequestError.invalidRequest(message);
  }
  async tryCallRequestHandler(method, params) {
    try { return { result: await this.requestHandler(method, params) ?? null }; }
    catch (error) { return this.errorResult(error); }
  }
  async tryCallNotificationHandler(method, params) {
    try { await this.notificationHandler(method, params); return { result: null }; }
    catch (error) { return this.errorResult(error); }
  }
  errorResult(error) {
    if (error instanceof RequestError) return error.toResult();
    const details = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
    return RequestError.internalError(details ? { details } : undefined).toResult();
  }
  handleResponse(response) {
    const pending = this.pendingResponses.get(response.id);
    if (!pending) return;
    this.pendingResponses.delete(response.id);
    if (Object.prototype.hasOwnProperty.call(response, 'result')) pending.resolve(response.result);
    else if (response.error) pending.reject(new RequestError(response.error.code, response.error.message, response.error.data));
    else pending.reject(RequestError.invalidRequest(response));
  }
  sendRequest(method, params, mapResponse) {
    if (this.signal.aborted) return rejectedPromise(this.closedReason());
    const id = this.nextRequestId++;
    const promise = new Promise((resolve, reject) => this.pendingResponses.set(id, { resolve: (value) => { try { resolve(mapResponse ? mapResponse(value) : value); } catch (error) { reject(error); } }, reject }));
    promise.catch(() => {});
    this.sendMessage({ jsonrpc: '2.0', id, method, params });
    return promise;
  }
  sendNotification(method, params) { return this.signal.aborted ? rejectedPromise(this.closedReason()) : this.sendMessage({ jsonrpc: '2.0', method, params }); }
  sendMessage(message) {
    this.writeQueue = this.writeQueue.then(async () => {
      const writer = this.stream.writable.getWriter();
      try { await writer.write(message); } finally { writer.releaseLock(); }
    }).catch((error) => this.close(error));
    return this.writeQueue;
  }
  closedReason() { return this.signal.reason || new Error('ACP connection closed'); }
  close(error) {
    if (this.signal.aborted) return;
    const reason = error || new Error('ACP connection closed');
    for (const pending of this.pendingResponses.values()) pending.reject(reason);
    this.pendingResponses.clear();
    this.abortController.abort(reason);
  }
}

module.exports = { RequestError, RpcConnection, rejectedPromise };
