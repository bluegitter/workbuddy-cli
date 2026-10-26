'use strict';
const { deriveSkillUploadName } = require('./skill-upload-slug');
function mergeSkillUploadMetadata(baseName, fromOptions, fromSkillMd) { return { name: fromOptions?.name?.trim() || fromSkillMd?.name?.trim() || undefined, title: fromOptions?.title?.trim() || fromSkillMd?.title?.trim() || baseName.trim() || undefined, description: fromOptions?.description?.trim() || fromSkillMd?.description?.trim() || undefined }; }
function resolveSkillUploadFormFieldsFromOptions(params) { const merged = mergeSkillUploadMetadata(params.baseName, params.options, null); return { name: deriveSkillUploadName(params.baseName, merged.name), title: merged.title, description: merged.description, version: params.options?.version, derivedSlug: deriveSkillUploadName(params.baseName) }; }
module.exports = Object.freeze({ mergeSkillUploadMetadata, resolveSkillUploadFormFieldsFromOptions });
