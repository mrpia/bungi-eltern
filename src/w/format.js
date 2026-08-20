// The German a delegate reads in the workbench, in one place.
//
// Not a translation table — there is nothing to translate, the workbench is German only.
// The point is that the wording can be reviewed without reading page logic, and that a
// test can hold it still. Codes and CSS hooks stay English.

import {
  forClassList, consentUnrecorded, caregiversForChild, UNKNOWN,
} from '../core/model.js';

// ---------------------------------------------------------------- consent

export const consentLabel = (value) =>
  (value === UNKNOWN ? 'unbekannt' : value ? 'ja' : 'nein');

/** CSS hook, so "unbekannt" can be made to look nothing like "nein". */
export const consentState = (value) =>
  (value === UNKNOWN ? 'unknown' : value ? 'yes' : 'no');

/**
 * One tap moves a consent answer on: unbekannt → ja → nein → unbekannt.
 *
 * No cycle order makes both common moves a single tap. This one favours the withdrawal —
 * someone who said yes and phones to say no is one tap — because that is the call a
 * delegate takes while doing something else, and the spec asks for ten seconds.
 */
export const nextConsent = (value) => (value === UNKNOWN ? true : value === true ? false : UNKNOWN);

// ---------------------------------------------------------------- the header line

/**
 * The counters above the list.
 *
 * "noch nicht gefragt" rather than "ohne Einverständnis": the whole reason this tool keeps
 * a third state is that never-asked and said-no are different situations, and only one of
 * them is a job still to do. A label that blurs them would undo that in the one place a
 * delegate actually looks.
 *
 * @returns {{text: string, tone: 'plain'|'warn'}[]}
 */
export function counters(project, expectedChildren = 0) {
  const withSomebody = project.children
    .filter((c) => caregiversForChild(project, c.id).length > 0).length;
  const unasked = consentUnrecorded(project).length;

  const out = [{
    text: expectedChildren
      ? `${withSomebody} von ${expectedChildren} Kindern`
      : `${withSomebody} ${withSomebody === 1 ? 'Kind' : 'Kinder'}`,
    tone: 'plain',
  }, {
    text: `${forClassList(project).length} auf der Klassenliste`,
    tone: 'plain',
  }];
  if (unasked) out.push({ text: `${unasked} noch nicht gefragt`, tone: 'warn' });
  return out;
}

// ---------------------------------------------------------------- intake

const list = (names) => names.filter(Boolean).join(', ');

/** The one sentence that says what taking a submission in would do. */
export function outcomeText(preview) {
  if (preview.outcome === 'unchanged') return 'Diese Angaben sind bereits erfasst.';

  const parts = [];
  if (preview.addedChildren.length) {
    parts.push(`${preview.addedChildren.length === 1 ? 'Neues Kind' : 'Neue Kinder'}: ${list(preview.addedChildren)}`);
  }
  if (preview.addedCaregivers.length) {
    parts.push(`${preview.addedCaregivers.length === 1 ? 'Neue Bezugsperson' : 'Neue Bezugspersonen'}: ${list(preview.addedCaregivers)}`);
  }
  if (parts.length) return parts.join(' · ');
  return 'Änderungen an bereits erfassten Angaben:';
}

export function mismatchText(submissionClass, openClass) {
  return openClass
    ? `Diese Angaben gehören zu ${submissionClass}, offen ist ${openClass}.`
    : `Diese Angaben gehören zu ${submissionClass}. Für diese Klasse ist noch nichts angelegt.`;
}

// ---------------------------------------------------------------- a person in the list

export function contactLine(caregiver) {
  return [caregiver.role, caregiver.email, caregiver.mobileDisplay || caregiver.mobile]
    .filter(Boolean).join(' · ');
}

export function addressLine(caregiver) {
  const a = caregiver.address;
  if (!a) return '';
  return [a.street, [a.postcode, a.town].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

export const personName = (p) => `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'ohne Namen';

// ---------------------------------------------------------------- file and save state

/** `klassenkontakte-3a-2026-09-15.json` — the product name, the class, the day. */
export const projectFileName = (slug, date) => `klassenkontakte-${slug}-${date}.json`;

const pad = (n) => String(n).padStart(2, '0');

/** Local wall-clock time, not a locale format: this only ever says "when did it save". */
export const savedText = (when) =>
  `Gespeichert ${pad(when.getHours())}:${pad(when.getMinutes())}`;

export const NOT_SAVED = 'Nicht gespeichert';
export const SAVING = 'Speichert …';

/**
 * The counts a delegate confirms before a project file replaces what is open.
 *
 * Replacing is the whole risk of the load button, so the numbers have to be in front of
 * them: a file from the wrong class or from before the parents' evening looks identical
 * from the outside.
 */
export function fileSummary(project) {
  const unasked = consentUnrecorded(project).length;
  const parts = [
    `${project.classLabel || 'ohne Klasse'} · ${project.schoolYear || 'ohne Schuljahr'}`,
    `${project.children.length} ${project.children.length === 1 ? 'Kind' : 'Kinder'}`,
    `${project.caregivers.length} ${project.caregivers.length === 1 ? 'Bezugsperson' : 'Bezugspersonen'}`,
  ];
  if (unasked) parts.push(`${unasked} noch nicht gefragt`);
  return parts.join(' · ');
}
