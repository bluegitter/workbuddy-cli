'use strict';

const MODEL_TAG_CUSTOM = 'custom';
const CUSTOM_LOCAL_MODEL_PREFIX = 'custom-local:';
const OVERRIDE_MODE = Symbol.for('@genie/product:overrideMode');
const MODEL_VARIANT_TYPES = new Set(['lite', 'reasoning', 'vision', 'longContext', 'subagent']);

function stripCustomLocalModelPrefix(modelId) {
  return typeof modelId === 'string' && modelId.startsWith(CUSTOM_LOCAL_MODEL_PREFIX)
    ? modelId.slice(CUSTOM_LOCAL_MODEL_PREFIX.length)
    : modelId;
}

function isModelVariantType(value) { return MODEL_VARIANT_TYPES.has(value); }

module.exports = { CUSTOM_LOCAL_MODEL_PREFIX, MODEL_TAG_CUSTOM, MODEL_VARIANT_TYPES, OVERRIDE_MODE, isModelVariantType, stripCustomLocalModelPrefix };
