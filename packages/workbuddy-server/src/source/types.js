'use strict';

const mcpTypes = require('@modelcontextprotocol/sdk/types.js');
const zod = require('zod/v4');
const zodCore = require('zod/v4/core');

// Preserve the generated module's helper exports for legacy server modules.
module.exports = Object.freeze({
  ...mcpTypes,
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
  meta: zod.meta,
  normalizeParams: zodCore.normalizeParams,
  parse: zod.parse,
  parseAsync: zod.parseAsync,
  safeParse: zod.safeParse,
  safeParseAsync: zod.safeParseAsync,
  string: zod.string,
  types_exports: mcpTypes,
});
