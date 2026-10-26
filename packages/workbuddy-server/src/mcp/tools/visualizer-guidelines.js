'use strict';

const ALL_MODULES = new Set(['diagram', 'mockup', 'interactive', 'art', 'chart']);
const CORE = `# Visualizer Core Design System

- Keep visuals seamless, flat, compact, and transparent around the host surface.
- Put explanations in the assistant response; the tool output contains only the visual.
- Do not use gradients, shadows, blur, glow, emoji, fixed positioning, document wrappers, or comments.
- Use sentence case, 11px minimum text, and weights 400/500 only.
- External resources are limited to cdnjs.cloudflare.com, esm.sh, cdn.jsdelivr.net, and unpkg.com.
- HTML widgets begin with an accessible hidden heading; SVG begins with role="img", title, and desc.`;
const COLORS = `# Color Palette

Use the semantic host variables (--color-background-*, --color-text-*, --color-border-*) and no more than two color ramps per diagram. Light mode uses light fills with 600-level strokes; dark mode uses dark fills with 200-level strokes.`;
const SVG = `# SVG Setup Rules

- Use a fixed viewBox beginning with "0 0 680 H" and transparent background.
- Keep the safe area between x=40 and x=640; calculate H from the bottommost element plus 20px.
- Use one SVG per call, no rotated text, and fill="none" on connector paths.
- Include an arrow marker in every SVG defs block.`;
const UI = `# UI Components

- Prefer compact controls with clear labels, visible focus states, and semantic host colors.
- Keep horizontal tiers to four boxes, avoid dense decoration, and ensure content remains readable while streaming.`;

class VisualizerGuidelines {
  static normalizeModules(modules) { const result = []; const seen = new Set(); for (const raw of modules ?? []) { if (typeof raw !== 'string') continue; const value = raw.trim(); if (ALL_MODULES.has(value) && !seen.has(value)) { seen.add(value); result.push(value); } } return result; }
  static build(modules = []) { const normalized = this.normalizeModules(modules); const sections = [CORE, COLORS]; if (normalized.some((item) => item === 'diagram' || item === 'art')) sections.push(SVG); if (normalized.some((item) => ['mockup', 'interactive', 'chart'].includes(item))) sections.push(UI); sections.push(...normalized.map((item) => `# ${item[0].toUpperCase()}${item.slice(1)} guidance\n\nCreate a focused ${item} visual with accessible labels, stable dimensions, and minimal host-compatible styling.`)); return sections.join('\n\n'); }
}

module.exports = Object.freeze({ ALL_MODULES, VisualizerGuidelines });
