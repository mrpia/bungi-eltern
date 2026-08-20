import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newProject, ingestSubmission, caregiversForChild, forClassList, forWhatsappGroup,
  consentUnrecorded, missingChildren, projectToJson, projectFromJson, deleteCaregiver, setConsent,
  UNKNOWN, PROJECT_VERSION,
} from '../src/core/model.js';

const NOW = '2026-09-15';
const project = () => newProject({ classLabel: 'Klasse 3a', schoolYear: '2026/27', now: NOW });

const submission = (over = {}) => ({
  classLabel: 'Klasse 3a', schoolYear: '2026/27', noticeVersion: '2026-08-1', date: NOW,
  children: [{ firstName: 'Léa', lastName: 'Müller' }],
  caregivers: [{ firstName: 'Sophie', lastName: 'Müller', role: 'Mutter',
                 email: 'sophie@bluewin.ch', mobile: '+41791234567' }],
  consent: { classList: true, whatsappGroup: true },
  ...over,
});

const ingest = (p, s) => ingestSubmission(p, s, { now: NOW });

test('model: normalisation happens on the way in', () => {
  const p = project();
  ingest(p, submission({
    children: [{ firstName: 'léa', lastName: 'MÜLLER' }],
    caregivers: [{ firstName: 'sophie', lastName: 'müller', email: 'S.Mueller@Bluewin.CH',
                   mobile: '079 123 45 67',
                   address: { street: 'Seestrasse 12', postcode: '8000', town: 'zürich' } }],
  }));
  assert.deepEqual({ ...p.children[0] }, { id: 'k1', firstName: 'Léa', lastName: 'Müller' });
  const c = p.caregivers[0];
  assert.equal(c.firstName, 'Sophie');
  assert.equal(c.email, 'S.Mueller@bluewin.ch');   // domain lowered, local part kept
  assert.equal(c.mobile, '+41791234567');
  assert.equal(c.mobileDisplay, '+41 79 123 45 67');
  assert.equal(c.mobileType, 'mobile');
  assert.equal(c.address.town, 'Zürich');
});

test('model: THE merge rule — a second form naming one parent leaves the other alone', () => {
  const p = project();
  ingest(p, submission({
    caregivers: [
      { firstName: 'Sophie', lastName: 'Müller', email: 'sophie@bluewin.ch', mobile: '+41791234567' },
      { firstName: 'Marc', lastName: 'Müller', email: 'marc@bluewin.ch', mobile: '+41789876543' },
    ],
  }));
  assert.equal(p.caregivers.length, 2);

  // Marc submits his own form later, for the same child, mentioning only himself.
  const r = ingest(p, submission({
    caregivers: [{ firstName: 'Marc', lastName: 'Müller', email: 'marc@bluewin.ch',
                   mobile: '+41780000000' }],
  }));
  assert.equal(p.caregivers.length, 2, 'no duplicate caregiver');
  assert.equal(p.children.length, 1, 'no duplicate child');

  const sophie = p.caregivers.find((c) => c.firstName === 'Sophie');
  const marc = p.caregivers.find((c) => c.firstName === 'Marc');
  assert.equal(sophie.mobile, '+41791234567', "Sophie's number untouched");
  assert.equal(sophie.email, 'sophie@bluewin.ch', "Sophie's email untouched");
  assert.equal(marc.mobile, '+41780000000', "Marc's new number applied");
  assert.equal(r.outcome, 'updated');
  assert.match(r.changes.join(' '), /Mobilnummer/, 'the change is described in German');
});

test('model: an empty incoming field never clears a stored one', () => {
  const p = project();
  ingest(p, submission());
  ingest(p, submission({
    caregivers: [{ firstName: 'Sophie', lastName: 'Müller', email: 'sophie@bluewin.ch', mobile: '' }],
  }));
  assert.equal(p.caregivers[0].mobile, '+41791234567', 'blank must not erase');
});

test('model: identity follows the contact channel, not the spelling of a name', () => {
  const p = project();
  ingest(p, submission());
  ingest(p, submission({
    caregivers: [{ firstName: 'Sophie', lastName: 'Müller-Bühler', email: 'sophie@bluewin.ch' }],
  }));
  assert.equal(p.caregivers.length, 1, 'matched on email');
  assert.equal(p.caregivers[0].lastName, 'Müller-Bühler', 'newer spelling wins');
});

test('model: a withdrawal takes effect and is described', () => {
  const p = project();
  ingest(p, submission());
  assert.equal(forClassList(p).length, 1);
  assert.equal(forWhatsappGroup(p).length, 1);

  const r = ingest(p, submission({ consent: { classList: false, whatsappGroup: false } }));
  assert.equal(forClassList(p).length, 0, 'removed from the list');
  assert.equal(forWhatsappGroup(p).length, 0, 'removed from the group');
  assert.equal(p.caregivers.length, 1, 'the person is still known to the delegate');
  assert.match(r.changes.join(' '), /Klassenliste: ja → nein/);
  assert.match(r.changes.join(' '), /WhatsApp-Gruppe: ja → nein/);
});

test('model: a list with no recorded consent is unknown, not a no', () => {
  const p = project();
  // An old WhatsApp group export: no consent block at all.
  ingest(p, {
    children: [{ firstName: 'Tim', lastName: 'Weber' }],
    caregivers: [{ firstName: 'Anna', lastName: 'Weber', mobile: '+41791112233' }],
  });
  const anna = p.caregivers[0];
  assert.equal(anna.consent.classList, UNKNOWN);
  assert.equal(anna.consent.source, 'legacy');
  assert.equal(forClassList(p).length, 0, 'excluded from anything shared');
  assert.equal(consentUnrecorded(p).length, 1, 'and flagged for asking');
});

test('model: children are linked to their caregivers, both directions', () => {
  const p = project();
  ingest(p, submission({
    children: [{ firstName: 'Léa', lastName: 'Müller' }, { firstName: 'Tim', lastName: 'Müller' }],
  }));
  assert.equal(p.children.length, 2, 'twins or siblings in one class');
  const lea = p.children.find((c) => c.firstName === 'Léa');
  assert.equal(caregiversForChild(p, lea.id).length, 1);
  assert.equal(p.caregivers[0].children.length, 2);
});

test('model: a later submission can fill in a missing surname', () => {
  const p = project();
  ingest(p, submission({ children: [{ firstName: 'Léa', lastName: '' }] }));
  assert.equal(p.children[0].lastName, '');
  ingest(p, submission({ children: [{ firstName: 'Léa', lastName: 'Müller' }] }));
  assert.equal(p.children.length, 1, 'still one child');
  assert.equal(p.children[0].lastName, 'Müller');
});

test('model: two children sharing a first name are not merged by guesswork', () => {
  const p = project();
  ingest(p, submission({
    children: [{ firstName: 'Noah', lastName: 'Müller' }],
    caregivers: [{ firstName: 'Sophie', lastName: 'Müller', email: 'sophie@bluewin.ch' }],
  }));
  ingest(p, submission({
    children: [{ firstName: 'Noah', lastName: 'Weber' }],
    caregivers: [{ firstName: 'Anna', lastName: 'Weber', email: 'anna@gmx.ch' }],
  }));
  assert.equal(p.children.length, 2, 'two different Noahs');

  // A third submission with no surname is ambiguous, so it must not attach to either.
  ingest(p, submission({
    children: [{ firstName: 'Noah', lastName: '' }],
    caregivers: [{ firstName: 'Peter', lastName: 'Zimmermann', email: 'peter@gmx.ch' }],
  }));
  assert.equal(p.children.length, 3, 'ambiguous, so kept separate for the delegate to see');
  assert.deepEqual(
    p.children.filter((c) => c.firstName === 'Noah').map((c) => c.lastName).sort(),
    ['', 'Müller', 'Weber']);
});

test('model: filling in a surname only merges when there is one candidate', () => {
  const p = project();
  ingest(p, submission({
    children: [{ firstName: 'Noah', lastName: '' }],
    caregivers: [{ firstName: 'A', lastName: 'A', email: 'a@gmx.ch' }],
  }));
  ingest(p, submission({
    children: [{ firstName: 'Noah', lastName: '' }],
    caregivers: [{ firstName: 'B', lastName: 'B', email: 'b@gmx.ch' }],
  }));
  assert.equal(p.children.length, 1, 'both matched the single nameless Noah');

  ingest(p, submission({
    children: [{ firstName: 'Noah', lastName: 'Weber' }],
    caregivers: [{ firstName: 'C', lastName: 'C', email: 'c@gmx.ch' }],
  }));
  assert.equal(p.children.length, 1);
  assert.equal(p.children[0].lastName, 'Weber');
});

test('model: the chase list names who is still missing', () => {
  const p = project();
  ingest(p, submission());
  assert.deepEqual(missingChildren(p, ['Léa Müller', 'Tim Weber', 'Nora Schmid']),
                   ['Tim Weber', 'Nora Schmid']);
});

test('model: a roster with first names only still matches', () => {
  const p = project();
  ingest(p, submission());
  assert.deepEqual(missingChildren(p, ['Léa', 'Tim']), ['Tim']);
});

test('model: a child with nobody attached counts as missing', () => {
  const p = project();
  ingest(p, submission({ caregivers: [{ firstName: '', lastName: '', email: '', mobile: '' }] }));
  assert.deepEqual(missingChildren(p, ['Léa Müller']), ['Léa Müller']);
});

test('model: project file round trip, wrong version refused with a code and a sentence', () => {
  const p = project();
  ingest(p, submission());
  const again = projectFromJson(projectToJson(p));
  assert.equal(again.ok, true);
  assert.equal(again.project.caregivers[0].consent.classList, true);

  const broken = projectFromJson('not json');
  assert.equal(broken.ok, false);
  assert.equal(broken.code, 'invalid-file');
  assert.match(broken.text, /gültige Datei/);

  const wrongVersion = projectFromJson('{"v":99,"children":[],"caregivers":[],"log":[]}');
  assert.equal(wrongVersion.code, 'version-mismatch');

  const incomplete = projectFromJson(`{"v":${PROJECT_VERSION},"children":[]}`);
  assert.equal(incomplete.code, 'missing-field');
  assert.match(incomplete.text, /caregivers/);
});

test('model: deleting a caregiver removes an orphaned child too', () => {
  const p = project();
  ingest(p, submission());
  assert.equal(deleteCaregiver(p, p.caregivers[0].id, NOW), true);
  assert.equal(p.caregivers.length, 0);
  assert.equal(p.children.length, 0, 'no name left behind with no purpose');
  assert.ok(p.log.some((e) => e.kind === 'deletion'));
});

test('model: unreadable input is reported with a code and German text, not dropped silently', () => {
  const p = project();
  const r = ingest(p, submission({
    caregivers: [{ firstName: 'Sophie', email: 'sophie@bluewin', mobile: '12345' }],
  }));
  assert.equal(r.notes.length, 2);
  assert.deepEqual(r.notes.map((n) => n.code).sort(), ['email-unreadable', 'mobile-unreadable']);
  assert.match(r.notes.map((n) => n.text).join(' '), /nicht lesbar/);
  assert.equal(p.caregivers[0].email, '', 'not stored as if it were valid');
});

test('model: a typo suggestion is a note, not a rewrite', () => {
  const p = project();
  const r = ingest(p, submission({
    caregivers: [{ firstName: 'Sophie', email: 'sophie@bluewin.cj' }],
  }));
  assert.equal(r.notes[0].code, 'email-typo');
  assert.match(r.notes[0].text, /bluewin\.ch/);
  assert.equal(p.caregivers[0].email, 'sophie@bluewin.cj', 'stored as given, never rewritten');
});

test('model: a consent field left out is unknown, not a no', () => {
  // A paper slip where the parent ticked the class list and ignored the WhatsApp box. The
  // ignored one is a question still to ask, and recording it as a refusal would hide that.
  const p = project();
  ingest(p, submission({ consent: { classList: true }, source: 'paper' }));
  const c = p.caregivers[0];
  assert.equal(c.consent.classList, true);
  assert.equal(c.consent.whatsappGroup, UNKNOWN);
  assert.equal(c.consent.source, 'paper');
  assert.equal(consentUnrecorded(p).length, 0, 'the class list was answered');
  assert.equal(forWhatsappGroup(p).length, 0, 'the group was not');
});

test('model: a whole slip with nothing ticked leaves both questions open', () => {
  const p = project();
  ingest(p, submission({ consent: { classList: null, whatsappGroup: null }, source: 'paper' }));
  assert.equal(forClassList(p).length, 0);
  assert.equal(consentUnrecorded(p).length, 1);
  assert.equal(p.caregivers[0].consent.source, 'paper',
    'still a paper slip, not a legacy list');
});

test('model: setConsent records a withdrawal and says so in the log', () => {
  const p = project();
  ingest(p, submission());
  const id = p.caregivers[0].id;
  assert.equal(forClassList(p).length, 1);

  assert.equal(setConsent(p, id, 'classList', false, '2026-10-01'), true);
  assert.equal(forClassList(p).length, 0);
  assert.equal(p.caregivers[0].consent.classList, false);
  assert.equal(p.caregivers[0].consent.source, 'delegate');
  assert.equal(p.caregivers[0].consent.recordedAt, '2026-10-01');

  const entry = p.log.at(-1);
  assert.equal(entry.kind, 'consent');
  assert.equal(entry.at, '2026-10-01');
  assert.equal(entry.text, 'Klassenliste: ja → nein (Sophie Müller)');
});

test('model: setConsent can put a question back to unanswered', () => {
  const p = project();
  ingest(p, submission());
  setConsent(p, p.caregivers[0].id, 'whatsappGroup', UNKNOWN, '2026-10-01');
  assert.equal(p.caregivers[0].consent.whatsappGroup, UNKNOWN);
  assert.equal(consentUnrecorded(p).length, 0, 'the class list is still answered');
  assert.equal(p.log.at(-1).text, 'WhatsApp-Gruppe: ja → unbekannt (Sophie Müller)');
});

test('model: setConsent reports doing nothing rather than logging noise', () => {
  const p = project();
  ingest(p, submission());
  const logged = p.log.length;
  assert.equal(setConsent(p, p.caregivers[0].id, 'classList', true, '2026-10-01'), false);
  assert.equal(setConsent(p, 'p999', 'classList', false, '2026-10-01'), false);
  assert.equal(setConsent(p, p.caregivers[0].id, 'somethingElse', false, '2026-10-01'), false);
  assert.equal(p.log.length, logged);
});

test('model: delegate names survive the file round trip', () => {
  const p = newProject({
    classLabel: 'Klasse 3a', schoolYear: '2026/27', delegates: 'Sophie Müller, Marc Weber',
    now: NOW,
  });
  const back = projectFromJson(projectToJson(p));
  assert.equal(back.ok, true);
  assert.equal(back.project.delegates, 'Sophie Müller, Marc Weber');
  assert.equal(newProject({ classLabel: 'Klasse 3a' }).delegates, '');
});

test('model: a changed number is reported the way it is written down', () => {
  const p = project();
  ingest(p, submission());
  const r = ingest(p, submission({
    caregivers: [{ firstName: 'Sophie', lastName: 'Müller', email: 'sophie@bluewin.ch',
                   mobile: '079 000 00 00' }],
  }));
  // Not "+41791234567 → +41790000000": nobody spots the difference between two runs of digits.
  assert.deepEqual(r.changes, ['Mobilnummer: +41 79 123 45 67 → +41 79 000 00 00']);
  assert.equal(p.caregivers[0].mobile, '+41790000000', 'stored in E.164 all the same');
  assert.equal(p.caregivers[0].mobileDisplay, '+41 79 000 00 00');
});

test('model: the log records the tidied name, not what the parent typed', () => {
  const p = project();
  ingest(p, submission({ children: [{ firstName: 'léa', lastName: 'MÜLLER' }] }));
  assert.equal(p.log.at(-1).text, 'new: Léa');
  ingest(p, submission({ children: [] }));
  assert.equal(p.log.at(-1).text, 'unchanged: ohne Kind');
});
