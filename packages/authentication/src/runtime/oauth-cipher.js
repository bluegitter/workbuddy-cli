'use strict';

const crypto = require('crypto');

const HKDF_INFO = Buffer.from('workbuddy-oauth-credentials-v1', 'utf8');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;
const CHECK_BYTES = 16;

function isCipherEnvelope(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.iv === 'string' && typeof value.tag === 'string' && typeof value.ct === 'string');
}

function assertUserId(userId) {
  if (!userId) throw new Error('OAuthCipher: userId is required');
  if (userId === 'default') throw new Error('OAuthCipher: refuse to operate with userId="default" (not signed in)');
}

function assertMasterKey(masterKey) {
  if (!Buffer.isBuffer(masterKey)) throw new Error('OAuthCipher: masterKey must be a Buffer');
  if (masterKey.length !== KEY_BYTES) throw new Error(`OAuthCipher: masterKey length ${masterKey.length}, expect ${KEY_BYTES}`);
}

function computeCheck(input, salt) {
  return crypto.createHash('sha256').update(input).update(salt).digest().subarray(0, CHECK_BYTES).toString('base64');
}

function createHeader(userId, masterKey) {
  assertUserId(userId);
  assertMasterKey(masterKey);
  const salt = crypto.randomBytes(SALT_BYTES);
  return { scheme: 'aes-256-gcm', kdf: 'hkdf-sha256', salt: salt.toString('base64'), userIdCheck: computeCheck(Buffer.from(userId, 'utf8'), salt), keyCheck: computeCheck(masterKey, salt), createdAt: Date.now() };
}

function verifyHeader(header, userId, masterKey) {
  if (!header || header.scheme !== 'aes-256-gcm' || header.kdf !== 'hkdf-sha256' || typeof header.salt !== 'string' || typeof header.userIdCheck !== 'string' || typeof header.keyCheck !== 'string') return { ok: false, reason: 'malformed' };
  let salt;
  try { salt = Buffer.from(header.salt, 'base64'); } catch { return { ok: false, reason: 'malformed' }; }
  if (salt.length !== SALT_BYTES) return { ok: false, reason: 'malformed' };
  if (computeCheck(Buffer.from(userId, 'utf8'), salt) !== header.userIdCheck) return { ok: false, reason: 'userId-mismatch' };
  if (computeCheck(masterKey, salt) !== header.keyCheck) return { ok: false, reason: 'key-mismatch' };
  return { ok: true };
}

function deriveAesKey(masterKey, userId, salt) {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.concat([masterKey, Buffer.from(userId, 'utf8')]), salt, HKDF_INFO, KEY_BYTES));
}

function buildAad(userId, parts = {}) {
  return Buffer.from(`${userId}|${parts.serverKey}|${parts.fieldName}`, 'utf8');
}

class OAuthCipher {
  constructor(params) {
    assertUserId(params.userId);
    assertMasterKey(params.masterKey);
    const result = verifyHeader(params.header, params.userId, params.masterKey);
    if (!result.ok) throw new Error(`OAuthCipher: invalid header (${result.reason})`);
    this.userId = params.userId;
    this.aesKey = deriveAesKey(params.masterKey, params.userId, Buffer.from(params.header.salt, 'base64'));
  }

  encrypt(plaintext, aadParts) {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.aesKey, iv);
    cipher.setAAD(buildAad(this.userId, aadParts));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ciphertext.toString('base64') };
  }

  decrypt(envelope, aadParts) {
    if (!isCipherEnvelope(envelope)) throw new Error('OAuthCipher.decrypt: envelope shape invalid');
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    const ciphertext = Buffer.from(envelope.ct, 'base64');
    if (iv.length !== IV_BYTES) throw new Error(`OAuthCipher.decrypt: iv length ${iv.length}, expect ${IV_BYTES}`);
    if (tag.length !== TAG_BYTES) throw new Error(`OAuthCipher.decrypt: tag length ${tag.length}, expect ${TAG_BYTES}`);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.aesKey, iv);
    decipher.setAAD(buildAad(this.userId, aadParts));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}

module.exports = Object.freeze({ HKDF_INFO, SALT_BYTES, IV_BYTES, KEY_BYTES, TAG_BYTES, CHECK_BYTES, OAuthCipher, buildAad, computeCheck, createHeader, deriveAesKey, isCipherEnvelope, verifyHeader });
