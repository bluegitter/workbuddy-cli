'use strict';

const { getLiteralValue, getObjectShape, getSchemaDescription, isSchemaOptional, objectFromShape } = require('../../../workbuddy-core/src/runtime/schema-helpers');

const EMPTY_OBJECT_JSON_SCHEMA = Object.freeze({ type: 'object', properties: {} });
const EMPTY_COMPLETION_RESULT = Object.freeze({ completion: { values: [], hasMore: false } });

function isZodTypeLike(value) {
  return value !== null && typeof value === 'object' && typeof value.parse === 'function' && typeof value.safeParse === 'function';
}

function isZodSchemaInstance(value) {
  return Boolean(value && typeof value === 'object' && ('_def' in value || '_zod' in value || isZodTypeLike(value)));
}

function isZodRawShapeCompat(value) {
  if (!value || typeof value !== 'object' || isZodSchemaInstance(value)) return false;
  if (Object.keys(value).length === 0) return true;
  return Object.values(value).some(isZodTypeLike);
}

function getZodSchemaObject(schema) {
  if (!schema) return undefined;
  if (isZodRawShapeCompat(schema)) return objectFromShape(schema, { objectFactory: (shape) => shape });
  if (!isZodSchemaInstance(schema)) throw new Error('inputSchema must be a Zod schema or raw shape, received an unrecognized object');
  return schema;
}

function promptArgumentsFromSchema(schema) {
  const shape = getObjectShape(schema);
  if (!shape) return [];
  return Object.entries(shape).map(([name, field]) => ({ name, description: getSchemaDescription(field), required: !isSchemaOptional(field) }));
}

function getMethodValue(schema) {
  const methodSchema = getObjectShape(schema)?.method;
  if (!methodSchema) throw new Error('Schema is missing a method literal');
  const value = getLiteralValue(methodSchema);
  if (typeof value !== 'string') throw new Error('Schema method literal must be a string');
  return value;
}

function createCompletionResult(suggestions) {
  const values = Array.isArray(suggestions) ? suggestions.slice(0, 100) : [];
  return { completion: { values, total: Array.isArray(suggestions) ? suggestions.length : 0, hasMore: values.length < (Array.isArray(suggestions) ? suggestions.length : 0) } };
}

module.exports = { EMPTY_COMPLETION_RESULT, EMPTY_OBJECT_JSON_SCHEMA, createCompletionResult, getMethodValue, getZodSchemaObject, isZodRawShapeCompat, isZodSchemaInstance, isZodTypeLike, promptArgumentsFromSchema };
