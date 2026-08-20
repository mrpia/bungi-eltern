import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  neuesProjekt, einreichungAufnehmen, personenFuerKind, fuerKlassenliste, fuerWhatsapp,
  einwilligungOffen, fehlendeKinder, projektNachJson, projektAusJson, personLoeschen,
  UNBEKANNT, PROJEKT_VERSION,
} from '../src/core/model.js';

const JETZT = '2026-09-15';
const projekt = () => neuesProjekt({ klasse: 'Klasse 3a', schuljahr: '2026/27', jetzt: JETZT });

const einreichung = (over = {}) => ({
  klasse: 'Klasse 3a', schuljahr: '2026/27', merkblatt: '2026-08-1', datum: JETZT,
  kinder: [{ vorname: 'Léa', nachname: 'Müller' }],
  personen: [{ vorname: 'Sophie', nachname: 'Müller', rolle: 'Mutter',
               email: 'sophie@bluewin.ch', mobil: '+41791234567' }],
  einwilligung: { liste: true, whatsapp: true },
  ...over,
});

const aufnehmen = (p, s) => einreichungAufnehmen(p, s, { jetzt: JETZT });

test('model: normalisation happens on the way in', () => {
  const p = projekt();
  aufnehmen(p, einreichung({
    kinder: [{ vorname: 'léa', nachname: 'MÜLLER' }],
    personen: [{ vorname: 'sophie', nachname: 'müller', email: 'S.Mueller@Bluewin.CH',
                 mobil: '079 123 45 67', adresse: { strasse: 'Seestrasse 12', plz: '8000', ort: 'zürich' } }],
  }));
  assert.deepEqual({ ...p.kinder[0] }, { id: 'k1', vorname: 'Léa', nachname: 'Müller' });
  const person = p.personen[0];
  assert.equal(person.vorname, 'Sophie');
  assert.equal(person.email, 'S.Mueller@bluewin.ch');   // domain lowered, local part kept
  assert.equal(person.mobil, '+41791234567');
  assert.equal(person.mobilAnzeige, '+41 79 123 45 67');
  assert.equal(person.mobilArt, 'mobile');
  assert.equal(person.adresse.ort, 'Zürich');
});

test('model: THE merge rule — a second form naming one parent leaves the other alone', () => {
  const p = projekt();
  aufnehmen(p, einreichung({
    personen: [
      { vorname: 'Sophie', nachname: 'Müller', email: 'sophie@bluewin.ch', mobil: '+41791234567' },
      { vorname: 'Marc', nachname: 'Müller', email: 'marc@bluewin.ch', mobil: '+41789876543' },
    ],
  }));
  assert.equal(p.personen.length, 2);

  // Marc submits his own form later, for the same child, mentioning only himself.
  const r = aufnehmen(p, einreichung({
    personen: [{ vorname: 'Marc', nachname: 'Müller', email: 'marc@bluewin.ch',
                 mobil: '+41780000000' }],
  }));
  assert.equal(p.personen.length, 2, 'no duplicate person');
  assert.equal(p.kinder.length, 1, 'no duplicate child');

  const sophie = p.personen.find((x) => x.vorname === 'Sophie');
  const marc = p.personen.find((x) => x.vorname === 'Marc');
  assert.equal(sophie.mobil, '+41791234567', "Sophie's number untouched");
  assert.equal(sophie.email, 'sophie@bluewin.ch', "Sophie's email untouched");
  assert.equal(marc.mobil, '+41780000000', "Marc's new number applied");
  assert.equal(r.ergebnis, 'ergaenzt');
});

test('model: an empty incoming field never clears a stored one', () => {
  const p = projekt();
  aufnehmen(p, einreichung());
  // A resubmission where the parent left the mobile blank this time.
  aufnehmen(p, einreichung({
    personen: [{ vorname: 'Sophie', nachname: 'Müller', email: 'sophie@bluewin.ch', mobil: '' }],
  }));
  assert.equal(p.personen[0].mobil, '+41791234567', 'blank must not erase');
});

test('model: identity follows the contact channel, not the spelling of a name', () => {
  const p = projekt();
  aufnehmen(p, einreichung());
  // Same address, name typed differently a year later.
  aufnehmen(p, einreichung({
    personen: [{ vorname: 'Sophie', nachname: 'Müller-Bühler', email: 'sophie@bluewin.ch' }],
  }));
  assert.equal(p.personen.length, 1, 'matched on email');
  assert.equal(p.personen[0].nachname, 'Müller-Bühler', 'newer spelling wins');
});

test('model: a withdrawal takes effect', () => {
  const p = projekt();
  aufnehmen(p, einreichung());
  assert.equal(fuerKlassenliste(p).length, 1);
  assert.equal(fuerWhatsapp(p).length, 1);

  aufnehmen(p, einreichung({ einwilligung: { liste: false, whatsapp: false } }));
  assert.equal(fuerKlassenliste(p).length, 0, 'removed from the list');
  assert.equal(fuerWhatsapp(p).length, 0, 'removed from the group');
  assert.equal(p.personen.length, 1, 'the person is still known to the delegate');
});

test('model: a list with no recorded consent is unknown, not a no', () => {
  const p = projekt();
  // An old WhatsApp group export: no consent block at all.
  aufnehmen(p, {
    kinder: [{ vorname: 'Tim', nachname: 'Weber' }],
    personen: [{ vorname: 'Anna', nachname: 'Weber', mobil: '+41791112233' }],
  });
  const anna = p.personen[0];
  assert.equal(anna.einwilligung.liste, UNBEKANNT);
  assert.equal(anna.einwilligung.quelle, 'altbestand');
  assert.equal(fuerKlassenliste(p).length, 0, 'excluded from anything shared');
  assert.equal(einwilligungOffen(p).length, 1, 'and flagged for asking');
});

test('model: children are linked to their people, both directions', () => {
  const p = projekt();
  aufnehmen(p, einreichung({
    kinder: [{ vorname: 'Léa', nachname: 'Müller' }, { vorname: 'Tim', nachname: 'Müller' }],
  }));
  assert.equal(p.kinder.length, 2, 'twins or siblings in one class');
  const lea = p.kinder.find((k) => k.vorname === 'Léa');
  assert.equal(personenFuerKind(p, lea.id).length, 1);
  assert.equal(p.personen[0].kinder.length, 2);
});

test('model: a later submission can fill in a missing surname', () => {
  const p = projekt();
  aufnehmen(p, einreichung({ kinder: [{ vorname: 'Léa', nachname: '' }] }));
  assert.equal(p.kinder[0].nachname, '');
  aufnehmen(p, einreichung({ kinder: [{ vorname: 'Léa', nachname: 'Müller' }] }));
  assert.equal(p.kinder.length, 1, 'still one child');
  assert.equal(p.kinder[0].nachname, 'Müller');
});

test('model: the chase list names who is still missing', () => {
  const p = projekt();
  aufnehmen(p, einreichung());
  const roster = ['Léa Müller', 'Tim Weber', 'Nora Schmid'];
  assert.deepEqual(fehlendeKinder(p, roster), ['Tim Weber', 'Nora Schmid']);
});

test('model: a roster with first names only still matches', () => {
  const p = projekt();
  aufnehmen(p, einreichung());
  assert.deepEqual(fehlendeKinder(p, ['Léa', 'Tim']), ['Tim']);
});

test('model: a child with nobody attached counts as missing', () => {
  const p = projekt();
  // A submission with a child but no usable person.
  aufnehmen(p, einreichung({ personen: [{ vorname: '', nachname: '', email: '', mobil: '' }] }));
  assert.deepEqual(fehlendeKinder(p, ['Léa Müller']), ['Léa Müller']);
});

test('model: project file round trip, wrong version refused', () => {
  const p = projekt();
  aufnehmen(p, einreichung());
  const wieder = projektAusJson(projektNachJson(p));
  assert.equal(wieder.ok, true);
  assert.deepEqual(wieder.projekt.personen[0].einwilligung.liste, true);

  assert.equal(projektAusJson('kein json').ok, false);
  assert.equal(projektAusJson('{"v":99,"kinder":[],"personen":[],"protokoll":[]}').ok, false);
  assert.match(projektAusJson(`{"v":${PROJEKT_VERSION},"kinder":[]}`).reason, /fehlt/);
});

test('model: deleting a person removes an orphaned child too', () => {
  const p = projekt();
  aufnehmen(p, einreichung());
  assert.equal(personLoeschen(p, p.personen[0].id, JETZT), true);
  assert.equal(p.personen.length, 0);
  assert.equal(p.kinder.length, 0, 'no name left behind with no purpose');
  assert.ok(p.protokoll.some((e) => e.art === 'loeschung'));
});

test('model: unreadable input is reported, not silently dropped', () => {
  const p = projekt();
  const r = aufnehmen(p, einreichung({
    personen: [{ vorname: 'Sophie', email: 'sophie@bluewin', mobil: '12345' }],
  }));
  assert.equal(r.hinweise.length, 2);
  assert.match(r.hinweise.join(' '), /E-Mail unlesbar/);
  assert.match(r.hinweise.join(' '), /Nummer unlesbar/);
  assert.equal(p.personen[0].email, '', 'not stored as if it were valid');
});

test('model: two children sharing a first name are not merged by guesswork', () => {
  const p = projekt();
  aufnehmen(p, einreichung({
    kinder: [{ vorname: 'Noah', nachname: 'Müller' }],
    personen: [{ vorname: 'Sophie', nachname: 'Müller', email: 'sophie@bluewin.ch' }],
  }));
  aufnehmen(p, einreichung({
    kinder: [{ vorname: 'Noah', nachname: 'Weber' }],
    personen: [{ vorname: 'Anna', nachname: 'Weber', email: 'anna@gmx.ch' }],
  }));
  assert.equal(p.kinder.length, 2, 'two different Noahs');

  // A third submission with no surname is ambiguous, so it must not attach to either.
  aufnehmen(p, einreichung({
    kinder: [{ vorname: 'Noah', nachname: '' }],
    personen: [{ vorname: 'Peter', nachname: 'Zimmermann', email: 'peter@gmx.ch' }],
  }));
  assert.equal(p.kinder.length, 3, 'ambiguous, so kept separate for the delegate to see');
  const noahs = p.kinder.filter((k) => k.vorname === 'Noah');
  assert.deepEqual(noahs.map((k) => k.nachname).sort(), ['', 'Müller', 'Weber']);
});

test('model: filling in a surname only merges when there is one candidate', () => {
  const p = projekt();
  // Two nameless children with the same first name: a later surname cannot pick one.
  aufnehmen(p, einreichung({
    kinder: [{ vorname: 'Noah', nachname: '' }],
    personen: [{ vorname: 'A', nachname: 'A', email: 'a@gmx.ch' }],
  }));
  aufnehmen(p, einreichung({
    kinder: [{ vorname: 'Noah', nachname: '' }],
    personen: [{ vorname: 'B', nachname: 'B', email: 'b@gmx.ch' }],
  }));
  assert.equal(p.kinder.length, 1, 'both matched the single nameless Noah');

  // With exactly one nameless candidate, a surname fills in.
  aufnehmen(p, einreichung({
    kinder: [{ vorname: 'Noah', nachname: 'Weber' }],
    personen: [{ vorname: 'C', nachname: 'C', email: 'c@gmx.ch' }],
  }));
  assert.equal(p.kinder.length, 1);
  assert.equal(p.kinder[0].nachname, 'Weber');
});
