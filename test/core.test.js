import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, normalizePhoneField } from '../src/core/phone.js';
import { normalizeName } from '../src/core/names.js';
import { normalizeEmail } from '../src/core/email.js';

test('phone: the forms a Swiss parent actually writes', () => {
  const swiss = [
    '079 123 45 67',
    '079/123 45 67',
    '+41 79 123 45 67',
    '+41 (0)79 123 45 67',
    '0041 79 123 45 67',
    '+41791234567',
    '079.123.45.67',
  ];
  for (const input of swiss) {
    const r = normalizePhone(input);
    assert.equal(r.ok, true, `should parse: ${input}`);
    assert.equal(r.e164, '+41791234567', input);
    assert.equal(r.display, '+41 79 123 45 67', input);
    assert.equal(r.type, 'mobile', input);
  }
});

test('phone: a lost trunk zero is recovered but flagged', () => {
  const r = normalizePhone('79 123 45 67');
  assert.equal(r.e164, '+41791234567');
  assert.deepEqual(r.warnings, ['assumed-swiss-missing-trunk-zero']);
});

test('phone: landline vs mobile vs service', () => {
  assert.equal(normalizePhone('044 123 45 67').type, 'landline');
  assert.equal(normalizePhone('031 123 45 67').type, 'landline');
  assert.equal(normalizePhone('079 123 45 67').type, 'mobile');
  assert.equal(normalizePhone('0800 123 456').type, 'service');
});

test('phone: cross-border families', () => {
  const fr = normalizePhone('+33 6 12 34 56 78');
  assert.equal(fr.iso, 'FR');
  assert.equal(fr.type, 'mobile');
  assert.equal(fr.e164, '+33612345678');

  assert.equal(normalizePhone('+49 151 23456789').type, 'mobile');
  assert.equal(normalizePhone('+49 30 123456').type, 'landline');
  assert.equal(normalizePhone('+39 333 1234567').type, 'mobile');
  assert.equal(normalizePhone('+43 664 123456').type, 'mobile');

  const li = normalizePhone('+423 660 12 34');
  assert.equal(li.iso, 'LI');
  assert.equal(li.display, '+423 660 12 34');
});

test('phone: rejects what it cannot honestly interpret', () => {
  assert.equal(normalizePhone('').ok, false);
  assert.equal(normalizePhone('   ').reason, 'empty');
  assert.equal(normalizePhone('keine').reason, 'no-digits');
  assert.equal(normalizePhone('12345').reason, 'ambiguous');
  assert.equal(normalizePhone('079 123 45').reason, 'too-short');
  assert.equal(normalizePhone('+41 79 123 45 67 89').reason, 'too-long');
});

test('phone: two numbers crammed into one field', () => {
  const r = normalizePhoneField('079 123 45 67 / 044 987 65 43');
  assert.equal(r.length, 2);
  assert.equal(r[0].e164, '+41791234567');
  assert.equal(r[1].e164, '+41449876543');

  const german = normalizePhoneField('079 123 45 67 oder 044 987 65 43');
  assert.equal(german.length, 2);
  assert.equal(german[1].type, 'landline');
});

test('names: single-case input gets fixed', () => {
  assert.equal(normalizeName('MÜLLER'), 'Müller');
  assert.equal(normalizeName('müller'), 'Müller');
  assert.equal(normalizeName('sophie müller'), 'Sophie Müller');
  assert.equal(normalizeName('meier-bühler'), 'Meier-Bühler');
  assert.equal(normalizeName("o'brien"), "O'Brien");
  assert.equal(normalizeName('MCDONALD'), 'McDonald');
  assert.equal(normalizeName('  léa   müller  '), 'Léa Müller');
});

test('names: particles stay lowercase after the first token', () => {
  assert.equal(normalizeName('van der meer'), 'Van der Meer');
  assert.equal(normalizeName('LUCA DE ROSSI'), 'Luca de Rossi');
});

test('names: mixed-case input is left alone, on purpose', () => {
  // The person typed their own name. Any rule we invent breaks one of these.
  for (const name of ['van der Meer', 'DiCaprio', 'McTavish', 'de Boer', 'LaFontaine']) {
    assert.equal(normalizeName(name), name);
  }
});

test('email: cleanup keeps the local part, lowercases the domain', () => {
  assert.equal(normalizeEmail(' Sophie.Mueller@Bluewin.CH ').value, 'Sophie.Mueller@bluewin.ch');
  assert.equal(normalizeEmail('mailto:a@gmail.com').value, 'a@gmail.com');
  assert.equal(normalizeEmail('<a@gmail.com>').value, 'a@gmail.com');
  assert.equal(normalizeEmail('a@gmail.com.').value, 'a@gmail.com');
});

test('email: rejects the malformed', () => {
  assert.equal(normalizeEmail('').reason, 'empty');
  assert.equal(normalizeEmail('sophie.mueller').reason, 'no-at');
  assert.equal(normalizeEmail('@gmail.com').reason, 'no-at');
  assert.equal(normalizeEmail('a@gmail').reason, 'malformed');
});

test('email: suggests, never rewrites', () => {
  assert.equal(normalizeEmail('a@gmial.com').suggestion, 'a@gmail.com');   // transposition
  assert.equal(normalizeEmail('a@gmail.co').suggestion, 'a@gmail.com');    // deletion
  assert.equal(normalizeEmail('a@bluewin.cj').suggestion, 'a@bluewin.ch'); // substitution
  assert.equal(normalizeEmail('a@bluewin.ch').suggestion, undefined);
  assert.equal(normalizeEmail('a@eigenedomain.ch').suggestion, undefined);
});
