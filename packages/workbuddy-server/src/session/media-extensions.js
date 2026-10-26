'use strict';
const IMAGE_EXTS = new Set('jpg jpeg png gif webp svg bmp ico'.split(' '));
const DIAGRAM_EXTS = new Set('excalidraw drawio dio'.split(' '));
const VIDEO_EXTS = new Set('mp4 mov mkv avi webm wmv 3gp 3g2 flv f4v mts m2ts ts mxf prores nev mpg mpeg m4v ogv vob asf rm rmvb'.split(' '));
const AUDIO_EXTS = new Set('mp3 wav ogg aac flac m4a wma opus'.split(' '));
const DOC_EXTS = new Set('pdf docx xlsx xls pptx csv md'.split(' '));
const WEB_EXTS = new Set(['html', 'htm']);
const ALL_MEDIA_EXTS = new Set([...IMAGE_EXTS, ...DIAGRAM_EXTS, ...VIDEO_EXTS, ...AUDIO_EXTS, ...DOC_EXTS, ...WEB_EXTS]);
module.exports = Object.freeze({ IMAGE_EXTS, DIAGRAM_EXTS, VIDEO_EXTS, AUDIO_EXTS, DOC_EXTS, WEB_EXTS, ALL_MEDIA_EXTS });
