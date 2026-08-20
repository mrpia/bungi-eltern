import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeSubmission, decodeSubmission, readableSummary, submissionMessage, PAYLOAD_VERSION,
} from '../src/core/payload.js';

const beispiel = {
  klasse: 'Klasse 3a',
  schuljahr: '2026/27',
  merkblatt: '2026-08-1',
  datum: '2026-09-15',
  kinder: [{ vorname: 'Léa', nachname: 'Müller' }],
  personen: [
    { vorname: 'Sophie', nachname: 'Müller', rolle: 'Mutter',
      email: 'sophie@bluewin.ch', mobil: '+41791234567',
      adresse: { strasse: 'Seestrasse 12', plz: '8000', ort: 'Zürich' } },
    { vorname: 'Marc', nachname: 'Müller', rolle: 'Vater', mobil: '+41789876543' },
  ],
  einwilligung: { liste: true, whatsapp: false },
};

test('payload: round trip preserves everything that was given', () => {
  const r = decodeSubmission(encodeSubmission(beispiel));
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.submission.kinder, beispiel.kinder);
  assert.equal(r.submission.personen.length, 2);
  assert.equal(r.submission.personen[0].email, 'sophie@bluewin.ch');
  assert.deepEqual(r.submission.personen[0].adresse, beispiel.adresse ?? {
    strasse: 'Seestrasse 12', plz: '8000', ort: 'Zürich',
  });
  assert.equal(r.submission.personen[1].adresse, null, 'no address given, none invented');
  assert.deepEqual(r.submission.einwilligung, { liste: true, whatsapp: false });
});

test('payload: umlauts survive base64 round trip', () => {
  const r = decodeSubmission(encodeSubmission(beispiel));
  assert.equal(r.submission.kinder[0].vorname, 'Léa');
  assert.equal(r.submission.personen[0].nachname, 'Müller');
});

test('payload: never throws on the junk that arrives via WhatsApp', () => {
  for (const junk of [null, undefined, '', '   ', 'nicht base64!!', 'YWJj', '{}', 42, {}]) {
    const r = decodeSubmission(junk);
    assert.equal(r.ok, false, `should refuse: ${JSON.stringify(junk)}`);
    assert.ok(r.reason, 'must say why');
  }
});

test('payload: a future version is refused rather than half-read', () => {
  const wire = JSON.parse(Buffer.from(encodeSubmission(beispiel), 'base64url').toString());
  wire.v = PAYLOAD_VERSION + 1;
  const future = Buffer.from(JSON.stringify(wire)).toString('base64url');
  const r = decodeSubmission(future);
  assert.equal(r.ok, false);
  assert.match(r.reason, /unbekannte Version/);
});

test('payload: a submission with no caregiver is refused', () => {
  const leer = { ...beispiel, personen: [] };
  assert.equal(decodeSubmission(encodeSubmission(leer)).ok, false);
});

test('payload: the readable block shows consent in words', () => {
  const text = readableSummary(beispiel);
  assert.match(text, /Kind: Léa Müller/);
  assert.match(text, /Sophie Müller · Mutter · sophie@bluewin\.ch · \+41791234567/);
  assert.match(text, /Seestrasse 12, 8000 Zürich/);
  assert.match(text, /Klassenliste: ja/);
  assert.match(text, /WhatsApp-Gruppe: nein/);
  // Marc gave no address, so no empty address line appears for him.
  assert.equal((text.match(/^ {2}/gm) || []).length, 1);
});

test('payload: the message carries the link in the fragment, not the query', () => {
  const { text, link } = submissionMessage(beispiel, 'https://bungi-eltern.mrpia.ch/');
  assert.match(link, /^https:\/\/bungi-eltern\.mrpia\.ch\/w\/#d=/);
  assert.ok(!link.includes('?'), 'a query string would be sent to the server');
  assert.ok(text.includes(link));
  assert.ok(text.indexOf('Klassenliste: ja') < text.indexOf(link), 'readable part comes first');
});

test('payload: stays short enough to travel as a tappable link', () => {
  // WhatsApp handles long links, but a message that wraps over many lines looks broken and
  // invites people to "clean it up". Keep the whole thing inside a few hundred characters.
  const { link } = submissionMessage(beispiel, 'https://bungi-eltern.mrpia.ch');
  assert.ok(link.length < 700, `link is ${link.length} characters`);
});
