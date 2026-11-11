'use strict';
// Assemble src/ into one standalone HTML file: dist/befundungstool.html.
// Every module is inlined so the result works when opened directly from disk (file://).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const scripts = files => files.map(file => '<script>\n' + read(file) + '\n</script>').join('\n');

// Roboto variable font (SIL OFL 1.1, licenses/Roboto-OFL.txt), embedded so the page stays offline.
// Subset ranges are Google Fonts' own; the browser only decodes subsets it needs.
const FONT_SUBSETS = [
  ['greek', 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF'],
  ['latin-ext', 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF'],
  ['latin', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD']
];
function fontFaces() {
  return FONT_SUBSETS.map(([subset, range]) => {
    const data = fs.readFileSync(path.join(root, 'assets', 'fonts', `roboto-${subset}.woff2`)).toString('base64');
    return `@font-face{font-family:Roboto;font-style:normal;font-weight:100 900;font-stretch:100%;font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${range}}`;
  }).join('\n');
}

// Order matters: modules publish browser globals that later modules and src/core/editor.js use.
const slots = {
  FONT_STYLES: fontFaces,
  CORE_STYLES: () => read('src/styles/editor.css').replace(/\n$/, ''),
  MRA_STYLES: () => read('src/mra/theme.css') + '\n' + read('src/mra/styles.css'),
  CHEST_STYLES: () => read('src/chest/styles.css'),
  BUILDER_STYLES: () => read('src/builders/styles.css'),
  AI_STYLES: () => read('src/styles/ai.css'),
  THEME_STYLES: () => read('src/styles/material-tokens.css') + '\n' + read('src/styles/material.css'),
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
  SETTINGS_SCRIPTS: () => scripts(['src/settings/config.js', 'src/settings/crypto.js', 'src/settings/vault.js', 'src/settings/unified.js']),
  AI_SCRIPTS: () => scripts(['src/ai/diff.js', 'src/ai/providers.js', 'src/ai/contract.js', 'src/ai/local.js', 'src/ai/panel.js']),
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
  // Static assets for hosting and the launcher (manifest, icons, index redirect).
  fs.cpSync(path.join(root, 'public'), path.join(root, 'dist'), { recursive: true });
  return out;
}

if (require.main === module) console.log('Built ' + path.relative(root, build()));
module.exports = { build };
