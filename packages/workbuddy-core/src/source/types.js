'use strict';

// The generated bundle used to embed the complete MCP protocol schema and
// Zod v4 implementation here.  These are third-party APIs, so keep the
// compatibility surface local while resolving their maintained packages at
// runtime.
const mcpTypes = require('@modelcontextprotocol/sdk/types.js');
const zod = require('zod/v4');
const zodCore = require('zod/v4/core');

const zodExports = {
  $ZodObject: zodCore.$ZodObject,
  $ZodType: zodCore.$ZodType,
  $constructor: zodCore.$constructor,
  NEVER: zodCore.NEVER,
  ZodNumber: zod.ZodNumber,
  ZodOptional: zod.ZodOptional,
  _coercedNumber: zodCore._coercedNumber,
  any: zod.any,
  array: zod.array,
  boolean: zod.boolean,
  clone: zod.clone,
  defineLazy: zodCore.defineLazy,
  describe: zod.describe,
  discriminatedUnion: zod.discriminatedUnion,
  enum: zod.enum,
  instanceof: zod.instanceof,
  literal: zod.literal,
  looseObject: zod.looseObject,
  meta: zod.meta,
  normalizeParams: zodCore.normalizeParams,
  nullable: zod.nullable,
  number: zod.number,
  object: zod.object,
  optional: zod.optional,
  parse: zod.parse,
  record: zod.record,
  safeParse: zod.safeParse,
  safeParseAsync: zod.safeParseAsync,
  string: zod.string,
  toJSONSchema: zod.toJSONSchema,
  union: zod.union,
  url: zod.url,
};

const compatibilityExports = {
  ListChangedOptionsBaseSchema: zod.object({
    autoRefresh: zod.boolean().default(true),
    debounceMs: zod.number().int().nonnegative().default(300),
  }),
  isJSONRPCErrorResponse: mcpTypes.isJSONRPCError,
  isJSONRPCResultResponse: mcpTypes.isJSONRPCResponse,
};

// `types_exports` is used by the compiled server's dynamic import path.
// Keep it pointing at the same object as the CommonJS surface.
module.exports = Object.freeze({
  ...mcpTypes,
  ...zodExports,
  ...compatibilityExports,
  types_exports: mcpTypes,
});
