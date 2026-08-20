import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSchoolYear, formatSchoolYear, schoolYearOf, advanceSchoolYear, schoolYearDiff,
} from '../src/core/schoolyear.js';
import { parseClassName, advanceClass, trainEndYear } from '../src/core/classname.js';

test('school year: the forms people write', () => {
  for (const input of ['2026/27', '2026/2027', '2026-27', '26/27', ' 2026 / 27 ']) {
    const r = parseSchoolYear(input);
    assert.equal(r.ok, true, input);
    assert.equal(r.startYear, 2026, input);
    assert.equal(r.label, '2026/27', input);
  }
});

test('school year: rejects nonsense and non-consecutive pairs', () => {
  assert.equal(parseSchoolYear('').reason, 'empty');
  assert.equal(parseSchoolYear('2026').reason, 'unrecognised');
  assert.equal(parseSchoolYear('2026/28').reason, 'not-consecutive');
});

test('school year: century rollover formats as 00', () => {
  assert.equal(formatSchoolYear(2099), '2099/00');
  assert.equal(formatSchoolYear(2009), '2009/10');
});

test('school year: July already belongs to the coming year', () => {
  assert.equal(schoolYearOf(new Date('2026-08-20')).label, '2026/27');
  assert.equal(schoolYearOf(new Date('2026-07-01')).label, '2026/27');
  assert.equal(schoolYearOf(new Date('2026-06-30')).label, '2025/26');
  assert.equal(schoolYearOf(new Date('2027-01-15')).label, '2026/27');
});

test('school year: advance and diff', () => {
  assert.equal(advanceSchoolYear('2026/27', 2).label, '2028/29');
  assert.equal(advanceSchoolYear('2026/27', -1).label, '2025/26');
  assert.equal(schoolYearDiff('2026/27', '2028/29'), 2);
  assert.equal(schoolYearDiff('2028/29', '2026/27'), -2);
});

test('class train: a Klassenzug advances, the group stays the same', () => {
  const start = parseClassName('Klasse 1a');
  assert.equal(advanceClass(start, 1).display, 'Klasse 2a');
  assert.equal(advanceClass(start, 2).display, 'Klasse 3a');
  assert.equal(advanceClass(start, 0).display, 'Klasse 1a');
  assert.equal(advanceClass('Klasse 4', 2).display, 'Klasse 6');
});

test('class train: kindergarten depends on an unresolved question, made explicit', () => {
  assert.equal(advanceClass('KiGa 1', 1).display, 'KiGa 1');                              // group
  assert.equal(advanceClass('KiGa 1', 1, { kigaNumberIsYearLevel: true }).display, 'KiGa 2');
});

test('class train: when the train ends and a fresh collection is due', () => {
  assert.equal(trainEndYear('Klasse 1a'), 3);
  assert.equal(trainEndYear('Klasse 3b'), 3);
  assert.equal(trainEndYear('Klasse 4'), 6);
  // Kindergarten has two or three parallel groups whose membership rolls over by about
  // half each year. The group never ends, so there is no train-end warning to give.
  assert.equal(trainEndYear('KiGa 1'), null);
  assert.equal(trainEndYear('KiGa 3'), null);
});
