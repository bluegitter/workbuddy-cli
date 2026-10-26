'use strict';

const { webcrypto } = require('crypto');

const CryptoMode = Object.freeze({ Null: 0, RSA: 1, AESToken: 2 });
const AES = Object.freeze({ KEY_LENGTH: 16, NONCE_LENGTH: 12, TAG_LENGTH: 16, TAG_LENGTH_BITS: 128 });
const defaultCrypto = webcrypto;

function toBase64(bytes) { return Buffer.from(bytes).toString('base64'); }
function fromBase64(value) { return new Uint8Array(Buffer.from(value, 'base64')); }
function nowInSeconds() { return Math.floor(Date.now() / 1000); }

class AesGcmCipher {
  constructor(cryptoImpl = defaultCrypto) { this.crypto = cryptoImpl; }
  generateRawKey() { return this.crypto.getRandomValues(new Uint8Array(AES.KEY_LENGTH)); }
  importKey(rawKey) { return this.crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
  async encrypt(key, plaintext) {
    const nonce = this.crypto.getRandomValues(new Uint8Array(AES.NONCE_LENGTH));
    const encrypted = new Uint8Array(await this.crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: AES.TAG_LENGTH_BITS }, key, new TextEncoder().encode(plaintext)));
    const output = new Uint8Array(nonce.length + encrypted.length); output.set(nonce); output.set(encrypted, nonce.length); return toBase64(output);
  }
  async decrypt(key, ciphertext) {
    const decoded = fromBase64(ciphertext); if (decoded.length < AES.NONCE_LENGTH + AES.TAG_LENGTH) return '';
    const plaintext = await this.crypto.subtle.decrypt({ name: 'AES-GCM', iv: decoded.subarray(0, AES.NONCE_LENGTH), tagLength: AES.TAG_LENGTH_BITS }, key, decoded.subarray(AES.NONCE_LENGTH));
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  }
}

class ImaDataCipher {
  constructor(options = {}) { this.crypto = options.crypto || defaultCrypto; this.aes = new AesGcmCipher(this.crypto); this.rsaPublicKey = options.rsaPublicKey; this.session = undefined; this.token = ''; this.tokenExpireTimestamp = 0; this.keyPromise = undefined; }
  hasValidToken() { return Boolean(this.token && this.tokenExpireTimestamp > nowInSeconds()); }
  setCryptoToken({ token, expire } = {}) { if (typeof token !== 'string' || !token || !Number.isFinite(Number(expire)) || Number(expire) <= 0) return { code: -1, msg: 'token is invalid' }; this.token = token; this.tokenExpireTimestamp = Number(expire); return { code: 0, msg: 'ok' }; }
  clearCryptoSession() { this.token = ''; this.tokenExpireTimestamp = 0; this.session = undefined; this.keyPromise = undefined; return { code: 0, msg: 'ok' }; }
  async ensureKey() { if (this.session) return this.session; if (!this.keyPromise) this.keyPromise = (async () => { const rawBytes = this.aes.generateRawKey(); const cryptoKey = await this.aes.importKey(rawBytes); this.session = { rawBytes, cryptoKey }; return this.session; })().finally(() => { this.keyPromise = undefined; }); return this.keyPromise; }
  async encrypt(plaintext) {
    if (typeof plaintext !== 'string' || !plaintext) return { success: false, data: '', mode: CryptoMode.Null };
    const key = await this.ensureKey(); const data = await this.aes.encrypt(key.cryptoKey, plaintext);
    if (this.hasValidToken()) return { success: true, data, mode: CryptoMode.AESToken, x_ima_ctk: this.token };
    if (!this.rsaPublicKey) return { success: true, data, mode: CryptoMode.RSA, x_ima_ckey: undefined };
    const publicKey = await this.crypto.subtle.importKey('spki', this.rsaPublicKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    const encryptedKey = toBase64(new Uint8Array(await this.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, key.rawBytes)));
    return { success: true, data, mode: CryptoMode.RSA, x_ima_ckey: encryptedKey };
  }
  async decrypt(ciphertext) { if (!this.session || typeof ciphertext !== 'string' || !ciphertext) return ''; return this.aes.decrypt(this.session.cryptoKey, ciphertext); }
  async encryptData(plaintext) { if (typeof plaintext !== 'string' || !plaintext) return { code: -1, msg: 'data is empty' }; try { const result = await this.encrypt(plaintext); const data = { data: result.data, x_ima_cm: result.mode, ...(result.mode === CryptoMode.RSA ? { x_ima_ckey: result.x_ima_ckey } : { x_ima_ctk: result.x_ima_ctk }) }; return { code: 0, msg: 'ok', data }; } catch (error) { return { code: -2, msg: error.message }; } }
  async decryptData(ciphertext) { if (!ciphertext) return { code: -1, msg: 'data is empty', data: '' }; try { const data = await this.decrypt(ciphertext); return data ? { code: 0, msg: 'ok', data } : { code: -1, msg: 'decrypted plaintext is empty', data: '' }; } catch (error) { return { code: -2, msg: error.message, data: '' }; } }
}

module.exports = Object.freeze({ AES, CryptoMode, AesGcmCipher, ImaDataCipher, nowInSeconds });
