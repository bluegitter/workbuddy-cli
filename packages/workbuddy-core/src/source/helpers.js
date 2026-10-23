'use strict';

// This module is the compatibility boundary for MCP's schema helpers. The
// generated artifact embedded Zod v3/v4, zod-to-json-schema, Ajv and Protocol
// internals; the SDK now owns those implementations.
const protocol = require('@modelcontextprotocol/sdk/shared/protocol.js');
const validation = require('@modelcontextprotocol/sdk/validation/ajv');
const zodCompat = require('@modelcontextprotocol/sdk/server/zod-compat.js');
const jsonSchemaCompat = require('@modelcontextprotocol/sdk/server/zod-json-schema-compat.js');
const taskHelpers = require('@modelcontextprotocol/sdk/experimental/tasks/helpers.js');

module.exports = Object.freeze({
  AjvJsonSchemaValidator: validation.AjvJsonSchemaValidator,
  Protocol: protocol.Protocol,
  assertClientRequestTaskCapability: taskHelpers.assertClientRequestTaskCapability,
  assertToolsCallTaskCapability: taskHelpers.assertToolsCallTaskCapability,
  getLiteralValue: zodCompat.getLiteralValue,
  getObjectShape: zodCompat.getObjectShape,
  getParseErrorMessage: zodCompat.getParseErrorMessage,
  getSchemaDescription: zodCompat.getSchemaDescription,
  isSchemaOptional: zodCompat.isSchemaOptional,
  isZ4Schema: zodCompat.isZ4Schema,
  mergeCapabilities: protocol.mergeCapabilities,
  normalizeObjectSchema: zodCompat.normalizeObjectSchema,
  objectFromShape: zodCompat.objectFromShape,
  safeParse: zodCompat.safeParse,
  safeParseAsync: zodCompat.safeParseAsync,
  toJsonSchemaCompat: jsonSchemaCompat.toJsonSchemaCompat,
});
