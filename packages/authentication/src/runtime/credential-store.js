'use strict';

const fs = require('fs');
const path = require('path');

class CredentialStore {
  constructor(file) { this.file = file; }

  read() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return {}; }
  }

  write(credentials) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  get(provider) { return this.read()[provider]; }
  set(provider, value) { const all = this.read(); all[provider] = value; this.write(all); }
  delete(provider) { const all = this.read(); delete all[provider]; this.write(all); }
}

module.exports = { CredentialStore };
