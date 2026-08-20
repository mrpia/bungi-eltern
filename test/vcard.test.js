import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caregiverToVCard, vcardFile, caregiverUid } from '../src/core/vcard.js';
import { normalizePhone } from '../src/core/phone.js';

const ctx = { classLabel: 'Klasse 3a', schoolYear: '2026/27', consentDate: '15.09.2026' };

const sophie = {
  trainId: 'k3a-2024',
  caregiver: {
    firstName: 'Sophie', lastName: 'Müller', email: 'sophie.mueller@bluewin.ch',
    phones: [normalizePhone('079 123 45 67'), normalizePhone('044 987 65 43')],
  },
  children: [{ firstName: 'Léa' }],
  household: { street: 'Seestrasse 12', postcode: '8000', town: 'Beispielhausen' },
};

function fields(vcf) {
  // Unfold first: a folded line continues with CRLF + single space.
  return vcf.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
}

test('vcard: the naming convention', () => {
  const f = fields(caregiverToVCard(sophie, ctx));
  assert.ok(f.includes('N:Müller;Sophie;;;'));
  assert.ok(f.includes('FN:Sophie Müller (Léa)'));
  assert.ok(f.includes('ORG:Klasse 3a'));
  assert.ok(f.includes('CATEGORIES:Klasse 3a 2026/27'));
});

test('vcard: siblings read as a list, not a repeated label', () => {
  const two = { ...sophie, children: [{ firstName: 'Léa' }, { firstName: 'Tim' }] };
  assert.ok(fields(caregiverToVCard(two, ctx)).includes('FN:Sophie Müller (Léa & Tim)'));

  const three = { ...sophie, children: [{ firstName: 'Léa' }, { firstName: 'Tim' }, { firstName: 'Nora' }] };
  assert.ok(fields(caregiverToVCard(three, ctx)).includes('FN:Sophie Müller (Léa & Tim & Nora)'));

  const none = { ...sophie, children: [] };
  assert.ok(fields(caregiverToVCard(none, ctx)).includes('FN:Sophie Müller'));
});

test('vcard: mobile and landline get different TEL types', () => {
  const f = fields(caregiverToVCard(sophie, ctx));
  assert.ok(f.includes('TEL;TYPE=CELL,VOICE:+41 79 123 45 67'));
  assert.ok(f.includes('TEL;TYPE=HOME,VOICE:+41 44 987 65 43'));
});

test('vcard: address uses the 3.0 field order', () => {
  const f = fields(caregiverToVCard(sophie, ctx));
  assert.ok(f.includes('ADR;TYPE=HOME:;;Seestrasse 12;Beispielhausen;;8000;Schweiz'));
});

test('vcard: address omitted when the family left it blank', () => {
  const noAddr = { ...sophie, household: {} };
  assert.ok(!fields(caregiverToVCard(noAddr, ctx)).some((l) => l.startsWith('ADR')));
});

test('vcard: separators in free text are escaped, not dropped', () => {
  const tricky = {
    ...sophie,
    caregiver: { ...sophie.caregiver, lastName: 'Müller; Bühler', firstName: 'Anne-Marie' },
    household: { street: 'Weg 1, Haus B', town: 'Ort', postcode: '8000' },
  };
  const raw = caregiverToVCard(tricky, ctx);
  assert.ok(raw.includes('N:Müller\; Bühler;Anne-Marie;;;'));
  assert.ok(raw.includes('Weg 1\\, Haus B'));
});

test('vcard: folds long lines without splitting a multi-byte character', () => {
  const long = {
    ...sophie,
    caregiver: { ...sophie.caregiver, lastName: 'Müllerhübschöckenbühlerbächtoldürsli'.repeat(3) },
  };
  const raw = caregiverToVCard(long, ctx);
  for (const line of raw.split('\r\n').filter(Boolean)) {
    assert.ok(new TextEncoder().encode(line).length <= 76, `line too long: ${line}`);
  }
  // Unfolding must restore the original name exactly — no mangled umlauts.
  assert.ok(fields(raw).some((l) => l.includes('Müllerhübschöckenbühlerbächtoldürsli'.repeat(3))));
});

test('vcard: UID is stable across regeneration and distinct per person', () => {
  const a = caregiverUid(sophie.caregiver, 'k3a-2024');
  assert.equal(a, caregiverUid({ ...sophie.caregiver, firstName: 'Sophie ' }, 'k3a-2024'));
  assert.notEqual(a, caregiverUid({ ...sophie.caregiver, email: 'marc@bluewin.ch' }, 'k3a-2024'));
  assert.notEqual(a, caregiverUid(sophie.caregiver, 'k3b-2024'));
  assert.match(a, /^kk-[0-9a-f]{8}$/);
});

test('vcard: file concatenates and stays parseable', () => {
  const file = vcardFile([sophie, sophie], ctx);
  assert.equal((file.match(/BEGIN:VCARD/g) || []).length, 2);
  assert.equal((file.match(/END:VCARD/g) || []).length, 2);
  assert.ok(file.endsWith('END:VCARD\r\n'));
});
