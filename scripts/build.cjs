'use strict';
// Assemble src/ into one standalone HTML file: dist/befundungstool.html.
// Every module is inlined so the result works when opened directly from disk (file://).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const scripts = files => files.map(file => '<script>\n' + read(file) + '\n</script>').join('\n');

// Order matters: modules publish browser globals that later modules and src/core/editor.js use.
const slots = {
  CORE_STYLES: () => read('src/styles/editor.css').replace(/\n$/, ''),
  MRA_STYLES: () => read('src/mra/theme.css') + '\n' + read('src/mra/styles.css'),
  CHEST_STYLES: () => read('src/chest/styles.css'),
  BUILDER_STYLES: () => read('src/builders/styles.css'),
  BOOT_SCRIPTS: () => scripts(['src/core/storage-migration.js']),
  EXAM_SHARED_SCRIPTS: () => scripts(['src/builders/preview.js', 'src/dictation/compat.js']),
  MRA_SCRIPTS: () => scripts(['src/mra/anatomy.js', 'src/mra/engine.js', 'src/mra/ui.js']),
  CHEST_SCRIPTS: () => scripts([
    'src/chest/definition.js', 'src/chest/state.js', 'src/chest/validation.js', 'src/chest/generator.js',
    'src/chest/components.js', 'src/chest/persistence.js', 'src/chest/ui.js'
  ]),
  BUILDER_SCRIPTS: () => scripts([
    'src/builders/schema.js', 'src/builders/head-definition.js', 'src/builders/skeleton-definition.js',
    'src/builders/esophagram-definition.js', 'src/builders/registry.js', 'src/builders/state.js',
    'src/builders/validation.js', 'src/builders/text.js', 'src/builders/head-generator.js',
    'src/builders/skeleton-generator.js', 'src/builders/esophagram-generator.js', 'src/builders/generator.js',
    'src/builders/persistence.js', 'src/builders/ui.js'
  ]),
  SETTINGS_SCRIPTS: () => scripts(['src/settings/config.js', 'src/settings/crypto.js', 'src/settings/unified.js']),
  CORE_SCRIPTS: () => read('src/core/editor.js').replace(/\n$/, '')
};

function build() {
  let html = read('src/app.html');
  for (const [name, content] of Object.entries(slots)) {
    const marker = `<!-- ${name} -->`;
    if (html.split(marker).length !== 2) throw new Error(`Expected exactly one ${marker} in src/app.html`);
    // Function replacement: module code may contain "$&"-style sequences that a string replacement would expand.
    html = html.replace(marker, () => content());
  }
  const leftover = html.match(/<!-- [A-Z_]+_(?:STYLES|SCRIPTS) -->/);
  if (leftover) throw new Error(`Unfilled build slot ${leftover[0]}`);
  const out = path.join(root, 'dist', 'befundungstool.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return out;
}

if (require.main === module) console.log('Built ' + path.relative(root, build()));
module.exports = { build };
