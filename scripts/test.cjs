'use strict';
// Build, then run every test script. Usage: node scripts/test.cjs [engine|ui|desktop|all] [name-filter]
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const [group, filter] = process.argv.slice(2);
const ALL = ['engine', 'ui', 'desktop'];
if (group !== undefined && !ALL.includes(group) && group !== 'all') {
  console.error(`Unknown test group: ${group} (use engine, ui, desktop or all)`);
  process.exit(2);
}
const groups = ALL.includes(group) ? [group] : ALL;
const TIMEOUT_MS = 300000; // per test script: a hung browser test fails instead of blocking the run

// Reuse locally copied Playwright browsers when present (avoids a download).
const browsers = path.join(root, '.playwright-browsers');
const env = { ...process.env };
if (!env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(browsers)) env.PLAYWRIGHT_BROWSERS_PATH = browsers;

require('./build.cjs').build();

let passed = 0, skipped = 0;
const failed = [];
for (const name of groups) {
  const dir = path.join(root, 'tests', name);
  if (!fs.existsSync(dir)) continue;
  // The desktop app needs the Electron binary, which `npm install --ignore-scripts` does not download.
  if (name === 'desktop' && !require('../tests/helpers/desktop.cjs').electronPath()) {
    skipped++;
    console.log('SKIP desktop: Electron binary not installed. Run "npm run desktop:setup" to download it, then "npm run test:desktop".');
    continue;
  }
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
if (!passed && !failed.length && !skipped) {
  console.error('No test scripts matched.');
  process.exit(1);
}
console.log(`\n${passed} passed, ${failed.length} failed${skipped ? ' (desktop group skipped)' : ''}${failed.length ? ': ' + failed.join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
