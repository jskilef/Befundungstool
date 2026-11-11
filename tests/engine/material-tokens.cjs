'use strict';
// Material 3 colour tokens: generated file is current, every theme defines every role,
// and text/background role pairs meet WCAG contrast (4.5:1 text, 3:1 outlines and large UI parts).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const M = require('../../scripts/material-tokens.cjs');

assert.equal(fs.readFileSync(M.OUT, 'utf8'), M.generate(), 'material-tokens.css is stale: run node scripts/material-tokens.cjs');

const TEXT_PAIRS = [
  ['on-primary', 'primary'], ['on-primary-container', 'primary-container'],
  ['on-secondary', 'secondary'], ['on-secondary-container', 'secondary-container'],
  ['on-tertiary', 'tertiary'], ['on-tertiary-container', 'tertiary-container'],
  ['on-error', 'error'], ['on-error-container', 'error-container'],
  ['inverse-on-surface', 'inverse-surface'], ['ext-on-warning-container', 'ext-warning-container'],
  ...['surface', 'surface-container-lowest', 'surface-container-low', 'surface-container', 'surface-container-high', 'surface-container-highest']
    .flatMap(bg => [['on-surface', bg], ['on-surface-variant', bg], ['primary', bg]])
];
let checked = 0;
for (const [name, theme] of Object.entries(M.THEMES)) {
  const s = M.scheme(theme);
  for (const [role] of M.ROLES) assert.match(s[role], /^#[0-9a-f]{6}$/, `${name} ${role}`);
  for (const [fg, bg] of TEXT_PAIRS) {
    const ratio = M.contrast(s[fg], s[bg]);
    assert(ratio >= 4.5, `${name}: ${fg} on ${bg} = ${ratio.toFixed(2)}`);
    checked++;
  }
  for (const bg of ['surface', 'surface-container-low']) {
    assert(M.contrast(s.outline, s[bg]) >= 3, `${name}: outline on ${bg}`);
  }
  // Tone = CIELAB L*: the generated colour must hit the requested lightness.
  const L = M.lch(s.surface).L;
  assert(Math.abs(L - (theme.dark ? 6 : 98)) < 0.6, `${name}: surface tone ${L}`);
}
console.log(`Material-Tokens: aktuell, alle Rollen definiert, ${checked} Kontrastpaare (WCAG) bestanden.`);
