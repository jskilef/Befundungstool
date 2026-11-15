'use strict';
// Build, then run every test script. Usage: node scripts/test.cjs [engine|ui] [name-filter]
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const [group, filter] = process.argv.slice(2);
if (group !== undefined && !['engine', 'ui', 'all'].includes(group)) {
  console.error(`Unknown test group: ${group} (use engine, ui or all)`);
  process.exit(2);
}
const groups = group === 'engine' || group === 'ui' ? [group] : ['engine', 'ui'];
const TIMEOUT_MS = 300000; // per test script: a hung browser test fails instead of blocking the run

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
    const result = spawnSync(process.execPath, [path.join(dir, file)], { cwd: root, env, encoding: 'utf8', timeout: TIMEOUT_MS });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (result.status === 0) {
      passed++;
      console.log(`PASS ${name}/${file} (${seconds}s)`);
    } else {
      failed.push(`${name}/${file}`);
      console.log(`FAIL ${name}/${file} (${seconds}s)${result.signal ? ' timed out' : ''}\n${(result.stdout || '') + (result.stderr || '') || result.error}`);
    }
  }
}
if (!passed && !failed.length) {
  console.error('No test scripts matched.');
  process.exit(1);
}
console.log(`\n${passed} passed, ${failed.length} failed${failed.length ? ': ' + failed.join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
