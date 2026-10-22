'use strict';

function isZ4Schema(schema) { return Boolean(schema && schema._zod); }

function objectFromShape(shape, { objectFactory } = {}) {
  const values = Object.values(shape || {});
  if (typeof objectFactory !== 'function') throw new TypeError('objectFactory is required to build a schema object');
  return objectFactory(shape, values.length === 0 ? {} : undefined);
}

function safeParse(schema, data) {
  if (isZ4Schema(schema) && typeof schema.safeParse === 'function') return schema.safeParse(data);
  if (typeof schema?.safeParse !== 'function') throw new TypeError('schema.safeParse is not available');
  return schema.safeParse(data);
}

async function safeParseAsync(schema, data) {
  if (isZ4Schema(schema) && typeof schema.safeParseAsync === 'function') return schema.safeParseAsync(data);
  if (typeof schema?.safeParseAsync !== 'function') return safeParse(schema, data);
  return schema.safeParseAsync(data);
}

function getObjectShape(schema) {
  if (!schema) return undefined;
  let shape = isZ4Schema(schema) ? schema._zod?.def?.shape : schema.shape;
  if (!shape) return undefined;
  if (typeof shape === 'function') {
    try { shape = shape(); } catch { return undefined; }
  }
  return shape;
}

function normalizeObjectSchema(schema, options) {
  if (!schema) return undefined;
  if (typeof schema === 'object' && !schema._def && !schema._zod) {
    const values = Object.values(schema);
    if (values.length > 0 && values.every((value) => value && typeof value === 'object' && (value._def !== undefined || value._zod !== undefined || typeof value.parse === 'function'))) return objectFromShape(schema, options);
  }
  if (isZ4Schema(schema)) return schema._zod?.def?.type === 'object' || schema._zod?.def?.shape !== undefined ? schema : undefined;
  return schema.shape !== undefined ? schema : undefined;
}

function getParseErrorMessage(error) {
  if (error && typeof error === 'object') {
    if (typeof error.message === 'string') return error.message;
    if (Array.isArray(error.issues) && error.issues[0]?.message !== undefined) return String(error.issues[0].message);
    try { return JSON.stringify(error); } catch { return String(error); }
  }
  return String(error);
}

function getSchemaDescription(schema) { return schema?.description; }
function isSchemaOptional(schema) {
  if (!schema) return false;
  if (isZ4Schema(schema)) return schema._zod?.def?.type === 'optional';
  if (typeof schema.isOptional === 'function') return schema.isOptional();
  return schema._def?.typeName === 'ZodOptional';
}
function getLiteralValue(schema) {
  const def = isZ4Schema(schema) ? schema._zod?.def : schema?._def;
  if (def?.value !== undefined) return def.value;
  if (Array.isArray(def?.values) && def.values.length) return def.values[0];
  return schema?.value;
}

function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function mergeCapabilities(base = {}, additional = {}) {
  const result = { ...base };
  for (const [key, value] of Object.entries(additional || {})) {
    if (value === undefined) continue;
    result[key] = isPlainObject(result[key]) && isPlainObject(value) ? { ...result[key], ...value } : value;
  }
  return result;
}

module.exports = {
  getLiteralValue, getObjectShape, getParseErrorMessage, getSchemaDescription,
  isPlainObject, isSchemaOptional, isZ4Schema, mergeCapabilities, normalizeObjectSchema,
  objectFromShape, safeParse, safeParseAsync,
};
