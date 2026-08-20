import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject, ingestSubmission, UNKNOWN } from '../src/core/model.js';
import {
  consentLabel, consentState, nextConsent, counters, outcomeText, mismatchText,
  contactLine, addressLine, personName, projectFileName, savedText, fileSummary,
} from '../src/w/format.js';

const NOW = '2026-09-15';
const project = () => newProject({ classLabel: 'Klasse 3a', schoolYear: '2026/27', now: NOW });

const family = (firstName, over = {}) => ({
  classLabel: 'Klasse 3a', schoolYear: '2026/27', date: NOW,
  children: [{ firstName, lastName: 'Müller' }],
  caregivers: [{ firstName: `${firstName}s Mutter`, lastName: 'Müller',
                 role: 'Mutter', email: `${firstName.toLowerCase()}@bluewin.ch` }],
  consent: { classList: true, whatsappGroup: false },
  ...over,
});

test('format: the three consent states read and look different', () => {
  assert.equal(consentLabel(true), 'ja');
  assert.equal(consentLabel(false), 'nein');
  assert.equal(consentLabel(UNKNOWN), 'unbekannt');
  // The CSS hook has to distinguish all three, or "never asked" ends up styled as "no".
  assert.equal(consentState(true), 'yes');
  assert.equal(consentState(false), 'no');
  assert.equal(consentState(UNKNOWN), 'unknown');
  assert.equal(new Set(['yes', 'no', 'unknown']).size, 3);
});

test('format: a recorded yes is one tap from a withdrawal', () => {
  assert.equal(nextConsent(true), false);
  // And the cycle closes, so no state is a dead end.
  assert.equal(nextConsent(false), UNKNOWN);
  assert.equal(nextConsent(UNKNOWN), true);
});

test('format: the counters count children, not submissions', () => {
  const p = project();
  ingestSubmission(p, family('Léa'), { now: NOW });
  ingestSubmission(p, family('Léa'), { now: NOW });     // the same family again
  ingestSubmission(p, family('Noah'), { now: NOW });

  const texts = counters(p, 22).map((c) => c.text);
  assert.equal(texts[0], '2 von 22 Kindern');
  assert.equal(texts[1], '2 auf der Klassenliste');
});

test('format: never-asked is counted and flagged, said-no is neither', () => {
  const p = project();
  ingestSubmission(p, family('Léa', { consent: undefined }), { now: NOW });   // never asked
  ingestSubmission(p, family('Noah', { consent: { classList: false, whatsappGroup: false } }),
    { now: NOW });                                                            // asked, said no

  const shown = counters(p, 22);
  const unasked = shown.find((c) => c.text.includes('noch nicht gefragt'));
  assert.ok(unasked, shown.map((c) => c.text).join(' | '));
  assert.equal(unasked.text, '1 noch nicht gefragt');
  assert.equal(unasked.tone, 'warn', 'it is a job still to do, so it has to stand out');
});

test('format: with nobody unasked there is no third counter', () => {
  const p = project();
  ingestSubmission(p, family('Léa'), { now: NOW });
  assert.equal(counters(p, 22).length, 2);
});

test('format: the outcome sentence names what would arrive', () => {
  assert.equal(
    outcomeText({ outcome: 'new', addedChildren: ['Léa Müller'], addedCaregivers: ['Sophie Müller'], changes: [] }),
    'Neues Kind: Léa Müller · Neue Bezugsperson: Sophie Müller');
  assert.equal(
    outcomeText({ outcome: 'new', addedChildren: ['Léa Müller', 'Noah Müller'], addedCaregivers: [], changes: [] }),
    'Neue Kinder: Léa Müller, Noah Müller');
  assert.equal(
    outcomeText({ outcome: 'unchanged', addedChildren: [], addedCaregivers: [], changes: [] }),
    'Diese Angaben sind bereits erfasst.');
  assert.match(
    outcomeText({ outcome: 'updated', addedChildren: [], addedCaregivers: [], changes: ['Mobilnummer: a → b'] }),
    /Änderungen/);
});

test('format: the class warning names both classes', () => {
  assert.equal(mismatchText('Klasse 3a', 'KiGa 1'),
    'Diese Angaben gehören zu Klasse 3a, offen ist KiGa 1.');
  assert.match(mismatchText('Klasse 3a', undefined), /noch nichts angelegt/);
});

test('format: a person renders without empty separators', () => {
  assert.equal(contactLine({ role: 'Mutter', email: 'a@b.ch', mobileDisplay: '+41 79 123 45 67' }),
    'Mutter · a@b.ch · +41 79 123 45 67');
  assert.equal(contactLine({ role: 'Mutter', email: '', mobile: '' }), 'Mutter');
  assert.equal(addressLine({ address: null }), '');
  assert.equal(addressLine({ address: { street: 'Seestrasse 12', postcode: '8000', town: 'Zürich' } }),
    'Seestrasse 12, 8000 Zürich');
  assert.equal(addressLine({ address: { street: '', postcode: '', town: 'Zürich' } }), 'Zürich');
  assert.equal(personName({ firstName: 'Léa', lastName: '' }), 'Léa');
  assert.equal(personName({ firstName: '', lastName: '' }), 'ohne Namen');
});

test('format: the file name carries the class and the day', () => {
  assert.equal(projectFileName('3a', '2026-09-15'), 'klassenkontakte-3a-2026-09-15.json');
  assert.equal(projectFileName('kiga1', '2026-09-15'), 'klassenkontakte-kiga1-2026-09-15.json');
});

test('format: the save state shows the wall clock', () => {
  assert.equal(savedText(new Date(2026, 8, 15, 14, 32)), 'Gespeichert 14:32');
  assert.equal(savedText(new Date(2026, 8, 15, 9, 5)), 'Gespeichert 09:05');
});

test('format: a file is summarised by what a delegate would recognise it from', () => {
  const p = project();
  ingestSubmission(p, family('Léa', { consent: undefined }), { now: NOW });
  assert.equal(fileSummary(p),
    'Klasse 3a · 2026/27 · 1 Kind · 1 Bezugsperson · 1 noch nicht gefragt');
});
