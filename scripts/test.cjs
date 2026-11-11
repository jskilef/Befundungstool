'use strict';
// Build, then run every test script. Usage: node scripts/test.cjs [engine|ui] [name-filter]
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const [group, filter] = process.argv.slice(2);
const groups = group === 'engine' || group === 'ui' ? [group] : ['engine', 'ui'];

// Reuse locally copied Playwright browsers when present (avoids a download).
const browsers = path.join(root, '.playwright-browsers');
const env = { ...process.env };
if (!env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(browsers)) env.PLAYWRIGHT_BROWSERS_PATH = browsers;

require('./build.cjs').build();

let passed = 0;
const failed = [];
for (const name of groups) {
  const dir = path.join(root, 'tests', name);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.cjs')).sort()) {
    if (filter && !file.includes(filter)) continue;
    const started = Date.now();
    const result = spawnSync(process.execPath, [path.join(dir, file)], { cwd: root, env, encoding: 'utf8' });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (result.status === 0) {
      passed++;
      console.log(`PASS ${name}/${file} (${seconds}s)`);
    } else {
      failed.push(`${name}/${file}`);
      console.log(`FAIL ${name}/${file} (${seconds}s)\n${(result.stdout || '') + (result.stderr || '') || result.error}`);
    }
  }
}
console.log(`\n${passed} passed, ${failed.length} failed${failed.length ? ': ' + failed.join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
