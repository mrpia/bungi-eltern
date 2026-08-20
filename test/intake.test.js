import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject, ingestSubmission } from '../src/core/model.js';
import { encodeSubmission } from '../src/core/payload.js';
import {
  submissionFromHash, sameClass, slugFor, previewIngest, HASH_PREFIX,
} from '../src/w/intake.js';

const NOW = '2026-09-15';

const submission = (over = {}) => ({
  classLabel: 'Klasse 3a', schoolYear: '2026/27', noticeVersion: '2026-08-1', date: NOW,
  children: [{ firstName: 'Léa', lastName: 'Müller' }],
  caregivers: [{ firstName: 'Sophie', lastName: 'Müller', role: 'Mutter',
                 email: 'sophie@bluewin.ch', mobile: '+41791234567' }],
  consent: { classList: true, whatsappGroup: true },
  ...over,
});

const project = () => newProject({ classLabel: 'Klasse 3a', schoolYear: '2026/27', now: NOW });

test('intake: a hash without a submission is not an error, it is nothing', () => {
  assert.equal(submissionFromHash(''), null);
  assert.equal(submissionFromHash('#'), null);
  assert.equal(submissionFromHash('#something-else'), null);
  assert.equal(submissionFromHash(undefined), null);
});

test('intake: a submission survives the round trip through a link', () => {
  const r = submissionFromHash(HASH_PREFIX + encodeSubmission(submission()));
  assert.equal(r.ok, true);
  assert.equal(r.submission.classLabel, 'Klasse 3a');
  assert.equal(r.submission.caregivers[0].email, 'sophie@bluewin.ch');
});

test('intake: a percent-encoded fragment is still readable', () => {
  // Some mail clients re-encode the fragment. base64url needs no escaping, so a percent
  // sign can only have been added on the way through.
  const encoded = encodeSubmission(submission());
  const mangled = HASH_PREFIX + encodeURIComponent(encoded);
  assert.equal(submissionFromHash(mangled).ok, true);
});

test('intake: a broken link gets a German sentence, not an exception', () => {
  const r = submissionFromHash('#d=nonsense');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'unreadable');
  assert.match(r.text, /Link/);
});

test('intake: classes match by slug, not by spelling', () => {
  assert.equal(sameClass('Klasse 3a', 'klasse 3a'), true);
  assert.equal(sameClass('Klasse 3a', '3a'), true);
  assert.equal(sameClass('Klasse 3a', 'Klasse 3b'), false);
  assert.equal(sameClass('KiGa 1', 'Klasse 1'), false);
  // Neither side readable: fall back to plain text rather than declaring a match, because
  // a wrong match files a family under the wrong class where nobody will find it.
  assert.equal(sameClass('Übergangsklasse', 'Übergangsklasse'), true);
  assert.equal(sameClass('Übergangsklasse', 'Werkstattklasse'), false);
  assert.equal(sameClass('Klasse 3a', ''), false);
});

test('intake: slugFor is empty for a name the parser cannot read', () => {
  assert.equal(slugFor('Klasse 3a'), '3a');
  assert.equal(slugFor('KiGa 2'), 'kiga2');
  assert.equal(slugFor('Übergangsklasse'), '');
});

test('intake: the preview says what is new and changes nothing', () => {
  const p = project();
  const preview = previewIngest(p, submission(), NOW);

  assert.equal(preview.outcome, 'new');
  assert.deepEqual(preview.addedChildren, ['Léa Müller']);
  assert.deepEqual(preview.addedCaregivers, ['Sophie Müller']);
  assert.equal(p.children.length, 0, 'the real project is untouched');
  assert.equal(p.caregivers.length, 0);
  assert.equal(p.counter, 0, 'not even the id counter moved');
  assert.equal(p.log.length, 0, 'and nothing was logged');
});

test('intake: the preview reports a changed number in words before it is applied', () => {
  const p = project();
  ingestSubmission(p, submission(), { now: NOW });

  const preview = previewIngest(p, submission({
    caregivers: [{ firstName: 'Sophie', lastName: 'Müller', role: 'Mutter',
                   email: 'sophie@bluewin.ch', mobile: '079 000 00 00' }],
  }), NOW);

  assert.equal(preview.outcome, 'updated');
  assert.deepEqual(preview.addedChildren, []);
  assert.deepEqual(preview.addedCaregivers, []);
  assert.ok(preview.changes.some((c) => c.includes('Mobilnummer')), preview.changes.join(' | '));
  assert.equal(p.caregivers[0].mobile, '+41791234567', 'still the old number');
});

test('intake: the preview recognises a submission that adds nothing', () => {
  const p = project();
  ingestSubmission(p, submission(), { now: NOW });
  const preview = previewIngest(p, submission(), NOW);
  assert.equal(preview.outcome, 'unchanged');
  assert.deepEqual(preview.changes, []);
});

test('intake: the preview carries the notes a delegate has to act on', () => {
  const preview = previewIngest(project(), submission({
    caregivers: [{ firstName: 'Sophie', email: 'sophie@gmial.com', mobile: '12345' }],
  }), NOW);
  const codes = preview.notes.map((n) => n.code);
  assert.ok(codes.includes('email-typo'), codes.join(','));
  assert.ok(codes.includes('mobile-unreadable'), codes.join(','));
});
