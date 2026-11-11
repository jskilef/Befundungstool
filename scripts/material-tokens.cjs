'use strict';
/* Generates Material Design 3 colour schemes for the six app themes -> src/styles/material-tokens.css.
   M3 "tone" equals CIELAB L*, so role contrast follows the M3 tone mapping exactly. Hue and chroma use
   CIELAB LCh as a dependency-free approximation of HCT (no material-color-utilities needed).
   Usage: node scripts/material-tokens.cjs [--check]   (--check fails if the committed file is stale) */
const fs = require('fs');
const path = require('path');

// ---- Colour math (sRGB D65 <-> CIELAB) --------------------------------------------------------
const EPS = 216 / 24389, KAPPA = 24389 / 27, WHITE = [0.95047, 1, 1.08883];
const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
}
function rgbToHex(rgb) {
  return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
}
function rgbToLab(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const xyz = [0.4124564 * r + 0.3575761 * g + 0.1804375 * b, 0.2126729 * r + 0.7151522 * g + 0.072175 * b, 0.0193339 * r + 0.119192 * g + 0.9503041 * b];
  const f = xyz.map((v, i) => { const t = v / WHITE[i]; return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116; });
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}
function labToLinearRgb([L, a, b]) {
  const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
  const xr = fx ** 3 > EPS ? fx ** 3 : (116 * fx - 16) / KAPPA;
  const yr = L > KAPPA * EPS ? fy ** 3 : L / KAPPA;
  const zr = fz ** 3 > EPS ? fz ** 3 : (116 * fz - 16) / KAPPA;
  const [X, Y, Z] = [xr * WHITE[0], yr * WHITE[1], zr * WHITE[2]];
  return [3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, -0.969266 * X + 1.8760108 * Y + 0.041556 * Z, 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z];
}
function lch(hex) {
  const [L, a, b] = rgbToLab(hexToRgb(hex));
  return { L, C: Math.hypot(a, b), H: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
}
// Colour with lightness = tone, given hue; chroma reduced until it fits sRGB.
function tone(hue, chroma, t) {
  if (t >= 100) return '#ffffff';
  if (t <= 0) return '#000000';
  const rad = hue * Math.PI / 180;
  const inGamut = c => labToLinearRgb([t, c * Math.cos(rad), c * Math.sin(rad)]).every(v => v >= -1e-7 && v <= 1 + 1e-7);
  let lo = 0, hi = chroma;
  if (!inGamut(hi)) { for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(mid)) lo = mid; else hi = mid; } hi = lo; }
  const c = hi;
  return rgbToHex(labToLinearRgb([t, c * Math.cos(rad), c * Math.sin(rad)]).map(fromLinear));
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---- Schemes -------------------------------------------------------------------------------
// Seeds keep each theme's identity: Studio/Slate teal, Midnight lavender on navy, Cobalt blue with orange.
const THEMES = {
  light: { dark: false, primary: '#1c6660' },
  dark: { dark: true, primary: '#1c6660', neutral: '#1a252e' },
  midnight: { dark: true, primary: '#5b4fc4', neutral: '#151a29' },
  'cobalt-light': { dark: false, primary: '#00338d', tertiary: '#ec6500' },
  'cobalt-dark': { dark: true, primary: '#00338d', tertiary: '#ec6500', neutral: '#14294b' }
};
const WARNING_SEED = '#ac710d';
// M3 baseline error roles.
const ERROR = {
  light: { error: '#b3261e', 'on-error': '#ffffff', 'error-container': '#f9dedc', 'on-error-container': '#410e0b' },
  dark: { error: '#f2b8b5', 'on-error': '#601410', 'error-container': '#8c1d18', 'on-error-container': '#f9dedc' }
};

function palettes(theme) {
  const p = lch(theme.primary);
  const n = theme.neutral ? lch(theme.neutral).H : p.H;
  const t = theme.tertiary ? lch(theme.tertiary) : { H: (p.H + 60) % 360, C: 28 };
  const w = lch(WARNING_SEED);
  return {
    // Lab chroma reads stronger than HCT chroma at high tones, hence the clamps.
    primary: [p.H, Math.min(Math.max(p.C, 32), 52)],
    secondary: [p.H, 16],
    tertiary: [t.H, Math.min(Math.max(t.C, 28), 60)],
    neutral: [n, theme.neutral ? 5 : 2.5],
    neutralVariant: [n, theme.neutral ? 10 : 7],
    warning: [w.H, Math.max(w.C, 40)]
  };
}

// [role, palette, light tone, dark tone] following the M3 baseline tone mapping.
const ROLES = [
  ['primary', 'primary', 40, 80], ['on-primary', 'primary', 100, 20], ['primary-container', 'primary', 90, 30], ['on-primary-container', 'primary', 10, 90],
  ['secondary', 'secondary', 40, 80], ['on-secondary', 'secondary', 100, 20], ['secondary-container', 'secondary', 90, 30], ['on-secondary-container', 'secondary', 10, 90],
  ['tertiary', 'tertiary', 40, 80], ['on-tertiary', 'tertiary', 100, 20], ['tertiary-container', 'tertiary', 90, 30], ['on-tertiary-container', 'tertiary', 10, 90],
  ['surface', 'neutral', 98, 6], ['on-surface', 'neutral', 10, 90], ['surface-dim', 'neutral', 87, 6], ['surface-bright', 'neutral', 98, 24],
  ['surface-container-lowest', 'neutral', 100, 4], ['surface-container-low', 'neutral', 96, 10], ['surface-container', 'neutral', 94, 12],
  ['surface-container-high', 'neutral', 92, 17], ['surface-container-highest', 'neutral', 90, 22],
  ['surface-variant', 'neutralVariant', 90, 30], ['on-surface-variant', 'neutralVariant', 30, 80],
  ['outline', 'neutralVariant', 50, 60], ['outline-variant', 'neutralVariant', 80, 30],
  ['inverse-surface', 'neutral', 20, 90], ['inverse-on-surface', 'neutral', 95, 20], ['inverse-primary', 'primary', 80, 40]
];
const EXTENDED = [['warning', 40, 80], ['on-warning', 100, 20], ['warning-container', 90, 30], ['on-warning-container', 10, 90]];

function scheme(theme) {
  const pal = palettes(theme);
  const out = {};
  for (const [role, name, light, dark] of ROLES) out[role] = tone(...pal[name], theme.dark ? dark : light);
  Object.assign(out, ERROR[theme.dark ? 'dark' : 'light']);
  out.scrim = '#000000';
  out.shadow = '#000000';
  for (const [role, light, dark] of EXTENDED) out['ext-' + role] = tone(...pal.warning, theme.dark ? dark : light);
  return out;
}

function generate() {
  const blocks = Object.entries(THEMES).map(([name, theme]) => {
    const s = scheme(theme);
    const selector = name === 'light' ? ':root,html[data-palette=light]' : `html[data-palette=${name}]`;
    const vars = Object.entries(s).map(([role, hex]) => role.startsWith('ext-') ? `--md-ext-color-${role.slice(4)}:${hex}` : `--md-sys-color-${role}:${hex}`);
    return `${selector}{color-scheme:${theme.dark ? 'dark' : 'light'};${vars.join(';')}}`;
  });
  return '/* GENERATED by scripts/material-tokens.cjs - do not edit. Material Design 3 colour roles per theme. */\n' + blocks.join('\n') + '\n';
}

const OUT = path.join(__dirname, '..', 'src', 'styles', 'material-tokens.css');
if (require.main === module) {
  const css = generate();
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(OUT, 'utf8') !== css) { console.error('material-tokens.css is stale: run node scripts/material-tokens.cjs'); process.exit(1); }
    console.log('material-tokens.css is up to date');
  } else {
    fs.writeFileSync(OUT, css);
    console.log('Wrote ' + path.relative(process.cwd(), OUT));
  }
}

module.exports = { THEMES, ROLES, generate, scheme, contrast, tone, lch, OUT };
