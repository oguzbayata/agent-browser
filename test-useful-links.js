'use strict';

const live = require('./useful-links-live');
const seed = require('./useful-links-seed');

let failed = 0;
function expect(ok, label) {
  if (!ok) {
    failed += 1;
    console.error(label);
  }
}

expect(Array.isArray(seed) && seed.length >= 4, 'seed should export catalog sections');
expect(
  seed.every((section) => section.id && section.title && Array.isArray(section.links)),
  'seed sections should have id, title, and links',
);

const mergedEmpty = live.mergeCatalog(seed, [], []);
expect(mergedEmpty.length === seed.length, 'empty live catalog should fall back to seed');

const liveOnly = live.mergeCatalog(seed, [{ id: 'popular', title: 'Popular', source: 'live', links: [] }], []);
expect(liveOnly.length === 1 && liveOnly[0].id === 'popular', 'live sections should replace seed when present');

expect(live.keywordQuery(' rust, privacy! ') === 'rust privacy', 'keyword query should strip punctuation');
expect(live.defaultLiveQueries().length >= 4, 'default live columns should exist');

if (failed) {
  console.error(`${failed} useful-links checks failed`);
  process.exit(1);
}

console.log(`useful-links ok · ${seed.length} seed sections · ${live.defaultLiveQueries().length} live columns`);
