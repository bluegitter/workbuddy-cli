#!/usr/bin/env node
/* Split a Rspack module table into inspectable CommonJS module files. */
const fs = require('fs');
const path = require('path');

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: split-rspack-bundle.js <bundle.js> <output-dir>');
  process.exit(2);
}

const source = fs.readFileSync(input, 'utf8');
const tableStart = source.indexOf('var __webpack_modules__={');
if (tableStart < 0) throw new Error('Rspack module table not found');
let cursor = tableStart + 'var __webpack_modules__={'.length;
const tableEnd = source.indexOf('},__webpack_module_cache__=', cursor);
if (tableEnd < 0) throw new Error('Rspack module table terminator not found');

fs.mkdirSync(output, { recursive: true });
const manifest = [];
while (cursor < tableEnd) {
  while (/\s|,/.test(source[cursor] || '')) cursor += 1;
  if (cursor >= tableEnd) break;
  const idStart = cursor;
  while (/\d/.test(source[cursor] || '')) cursor += 1;
  const id = source.slice(idStart, cursor);
  if (!id || source[cursor] !== '(') throw new Error(`invalid module near ${cursor}`);
  const bodyStart = source.indexOf('{', cursor);
  const nextModule = source.slice(bodyStart + 1, tableEnd).search(/,\d+\(/);
  const bodyEnd = nextModule < 0 ? tableEnd : bodyStart + 1 + nextModule;
  const signature = source.slice(cursor, bodyStart);
  // The boundary regex lands on the comma after the module's closing brace.
  const body = source.slice(bodyStart + 1, bodyEnd).replace(/}\s*$/, '');
  const file = `module-${id}.js`;
  fs.writeFileSync(path.join(output, file), `// Recovered bundle module ${id}; dependencies use the original __webpack_require__ contract.\nmodule.exports = function${signature}{${body}};\n`);
  manifest.push({ id: Number(id), file, bytes: body.length });
  cursor = bodyEnd + 1;
}
fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify({ input: path.basename(input), moduleCount: manifest.length, modules: manifest }, null, 2)}\n`);
console.log(`split ${manifest.length} modules from ${input}`);
