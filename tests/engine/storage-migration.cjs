'use strict';
// One-time copy of radnote browser data into Befundungstool keys.
const assert = require('node:assert/strict');
const M = require('../../src/core/storage-migration.js');

function storage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
}

// Copies all known radnote keys once, leaves radnote's data untouched, ignores unrelated keys.
const s = storage({ 'radnote-macros-v1': '[1]', 'radnote-theme': 'dark', 'radnote-draft-v1': '{"synthetic":true}', 'radnote-unknown': 'x' });
assert.deepEqual(M.migrate(s).sort(), ['draft-v1', 'macros-v1', 'theme']);
assert.equal(s.getItem('befundungstool-macros-v1'), '[1]');
assert.equal(s.getItem('radnote-macros-v1'), '[1]');
assert.equal(s.getItem('befundungstool-unknown'), null);
assert.equal(s.getItem(M.MARKER), 'radnote');

// Deleted data is not resurrected on the next start.
s.removeItem('befundungstool-draft-v1');
assert.deepEqual(M.migrate(s), []);
assert.equal(s.getItem('befundungstool-draft-v1'), null);

// Existing Befundungstool data is never overwritten or mixed with radnote data.
const own = storage({ 'befundungstool-theme': 'light', 'radnote-macros-v1': '[2]' });
assert.deepEqual(M.migrate(own), []);
assert.equal(own.getItem('befundungstool-macros-v1'), null);
assert.equal(own.getItem(M.MARKER), 'none');

assert.deepEqual(M.migrate(null), []);
console.log('Speichermigration: einmalige Übernahme, radnote-Daten unverändert, keine Wiederherstellung gelöschter Daten bestanden.');
