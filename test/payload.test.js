import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeSubmission, decodeSubmission, readableSummary, submissionMessage, PAYLOAD_VERSION,
} from '../src/core/payload.js';

const example = {
  classLabel: 'Klasse 3a',
  schoolYear: '2026/27',
  noticeVersion: '2026-08-1',
  date: '2026-09-15',
  children: [{ firstName: 'Léa', lastName: 'Müller' }],
  caregivers: [
    { firstName: 'Sophie', lastName: 'Müller', role: 'Mutter',
      email: 'sophie@bluewin.ch', mobile: '+41791234567',
      address: { street: 'Seestrasse 12', postcode: '8000', town: 'Zürich' } },
    { firstName: 'Marc', lastName: 'Müller', role: 'Vater', mobile: '+41789876543' },
  ],
  consent: { classList: true, whatsappGroup: false },
};

test('payload: round trip preserves everything that was given', () => {
  const r = decodeSubmission(encodeSubmission(example));
  assert.equal(r.ok, true, r.text);
  assert.deepEqual(r.submission.children, example.children);
  assert.equal(r.submission.caregivers.length, 2);
  assert.equal(r.submission.caregivers[0].email, 'sophie@bluewin.ch');
  assert.deepEqual(r.submission.caregivers[0].address, {
    street: 'Seestrasse 12', postcode: '8000', town: 'Zürich',
  });
  assert.equal(r.submission.caregivers[1].address, null, 'no address given, none invented');
  assert.deepEqual(r.submission.consent, { classList: true, whatsappGroup: false });
});

test('payload: umlauts survive base64 round trip', () => {
  const r = decodeSubmission(encodeSubmission(example));
  assert.equal(r.submission.children[0].firstName, 'Léa');
  assert.equal(r.submission.caregivers[0].lastName, 'Müller');
});

test('payload: never throws on the junk that arrives via WhatsApp', () => {
  for (const junk of [null, undefined, '', '   ', 'nicht base64!!', 'YWJj', '{}', 42, {}]) {
    const r = decodeSubmission(junk);
    assert.equal(r.ok, false, `should refuse: ${JSON.stringify(junk)}`);
    assert.ok(r.text, 'must say why');
  }
});

test('payload: the wire format is readable, with no translation table', () => {
  const wire = JSON.parse(Buffer.from(encodeSubmission(example), 'base64url').toString());
  assert.deepEqual(Object.keys(wire).sort(),
    ['caregivers', 'children', 'classLabel', 'consent', 'date', 'noticeVersion',
     'schoolYear', 'version']);
  assert.equal(wire.caregivers[0].firstName, 'Sophie');
  assert.equal(wire.consent.classList, true);
  // Empty fields are dropped rather than written as "".
  assert.ok(!('address' in wire.caregivers[1]), 'Marc gave no address, so no empty key');
});

test('payload: a future version is refused rather than half-read', () => {
  const wire = JSON.parse(Buffer.from(encodeSubmission(example), 'base64url').toString());
  wire.version = PAYLOAD_VERSION + 1;
  const future = Buffer.from(JSON.stringify(wire)).toString('base64url');
  const r = decodeSubmission(future);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'version-mismatch');
  assert.match(r.text, /anderen Version/);
});

test('payload: a submission with no caregiver is refused', () => {
  const leer = { ...example, caregivers: [] };
  assert.equal(decodeSubmission(encodeSubmission(leer)).ok, false);
});

test('payload: the readable block shows consent in words', () => {
  const text = readableSummary(example);
  assert.match(text, /Kind: Léa Müller/);
  assert.match(text, /Sophie Müller · Mutter · sophie@bluewin\.ch · \+41791234567/);
  assert.match(text, /Seestrasse 12, 8000 Zürich/);
  assert.match(text, /Klassenliste: ja/);
  assert.match(text, /WhatsApp-Gruppe: nein/);
  // Marc gave no address, so no empty address line appears for him.
  assert.equal((text.match(/^ {2}/gm) || []).length, 1);
});

test('payload: the message carries the link in the fragment, not the query', () => {
  const { text, link } = submissionMessage(example, 'https://bungi-eltern.mrpia.ch/');
  assert.match(link, /^https:\/\/bungi-eltern\.mrpia\.ch\/w\/#d=/);
  assert.ok(!link.includes('?'), 'a query string would be sent to the server');
  assert.ok(text.includes(link));
  assert.ok(text.indexOf('KlassenclassList: ja') < text.indexOf(link), 'readable part comes first');
});

test('payload: stays short enough to travel as a tappable link', () => {
  // WhatsApp handles long links, but a message that wraps over many lines looks broken and
  // invites people to "clean it up". Keep the whole thing inside a few hundred characters.
  const { link } = submissionMessage(example, 'https://bungi-eltern.mrpia.ch');
  assert.ok(link.length < 1200, `link is ${link.length} characters`);
});
