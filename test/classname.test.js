import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClassName, compareClasses, categoryLabel } from '../src/core/classname.js';

test('classname: the three real shapes', () => {
  const kiga = parseClassName('KiGa 1');
  assert.deepEqual(
    { ...kiga },
    { ok: true, stage: 'kiga', year: 1, section: null,
      display: 'KiGa 1', short: 'KiGa 1', slug: 'kiga1', sortKey: 10 },
  );

  const plain = parseClassName('Klasse 4');
  assert.equal(plain.display, 'Klasse 4');
  assert.equal(plain.short, '4');
  assert.equal(plain.slug, '4');
  assert.equal(plain.section, null);

  const split = parseClassName('Klasse 3a');
  assert.equal(split.display, 'Klasse 3a');
  assert.equal(split.short, '3a');
  assert.equal(split.slug, '3a');
  assert.equal(split.section, 'a');
});

test('classname: tolerant of how people actually type it', () => {
  for (const input of ['Klasse 3a', 'klasse 3a', 'klasse3a', 'Klasse 3 a', 'Kl. 3a', '3a', '3A']) {
    assert.equal(parseClassName(input).display, 'Klasse 3a', input);
  }
  for (const input of ['KiGa 1', 'kiga1', 'KG 1', 'Kindergarten 1', 'kiga  1']) {
    assert.equal(parseClassName(input).display, 'KiGa 1', input);
  }
});

test('classname: refuses what it cannot read', () => {
  assert.equal(parseClassName('').reason, 'empty');
  assert.equal(parseClassName('Sekundarschule').reason, 'unrecognised');
  assert.equal(parseClassName('Klasse 3c').reason, 'unrecognised'); // no c section here
  assert.equal(parseClassName('Klasse 0').reason, 'year-out-of-range');
});

test('classname: sorts the way a school lists classes', () => {
  const input = ['Klasse 3b', 'KiGa 2', 'Klasse 1', 'Klasse 3a', 'KiGa 1', 'Klasse 6'];
  const sorted = [...input].sort(compareClasses).map((c) => parseClassName(c).display);
  assert.deepEqual(sorted, ['KiGa 1', 'KiGa 2', 'Klasse 1', 'Klasse 3a', 'Klasse 3b', 'Klasse 6']);
});

test('classname: category label carries the school year', () => {
  assert.equal(categoryLabel('Klasse 3a', '2026/27'), 'Klasse 3a 2026/27');
  assert.equal(categoryLabel('KiGa 1', '2026/27'), 'KiGa 1 2026/27');
  assert.equal(categoryLabel('Klasse 3a'), 'Klasse 3a');
});
