'use strict';

const http = require('http');

class LocalServer {
  constructor({ routes = new Map(), host = '127.0.0.1', port = 0 } = {}) {
    this.routes = routes;
    this.host = host;
    this.port = port;
  }

  route(method, pathname, handler) { this.routes.set(`${method.toUpperCase()} ${pathname}`, handler); return this; }

  listen() {
    this.server = http.createServer(async (request, response) => {
      const handler = this.routes.get(`${request.method} ${request.url.split('?')[0]}`);
      if (!handler) { response.writeHead(404); response.end('Not Found'); return; }
      try { await handler(request, response); } catch (error) { response.writeHead(500); response.end(error.message); }
    });
    return new Promise((resolve) => this.server.listen(this.port, this.host, () => resolve(this.server.address())));
  }

  close() { return new Promise((resolve, reject) => this.server?.close((error) => error ? reject(error) : resolve())); }
}

module.exports = { LocalServer };
