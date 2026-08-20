// The delegate's dataset and the rules for growing it.
//
// Three entities, not four: the form no longer declares who lives with whom, so a
// household is not stored. The address rides on the caregiver, and the grouping key for
// every output is the child.
//
// Normalisation happens here, on the way in. Nothing downstream — no list, no vCard, no
// CSV — should ever have to wonder whether a value was cleaned. If raw input can reach a
// renderer, one export path will eventually be clean and another will not.
//
// Field names are English because developers read them; the *values* stay German because
// "Klasse 3a" and "Mutter" are real data. Anything a delegate reads on screen comes back
// as a German `text` next to an English `code`.

import { normalizeName } from './names.js';
import { normalizeEmail } from './email.js';
import { normalizePhone } from './phone.js';

export const PROJECT_VERSION = 1;

/** Consent that was never recorded. Distinct from a recorded "no". */
export const UNKNOWN = null;

export function newProject({ classLabel, schoolYear, startSchoolYear, now }) {
  return {
    v: PROJECT_VERSION,
    classLabel: classLabel || '',
    schoolYear: schoolYear || '',
    startSchoolYear: startSchoolYear || schoolYear || '',
    created: now || '',
    counter: 0,
    children: [],
    caregivers: [],
    log: [],
  };
}

const nextId = (project, prefix) => `${prefix}${++project.counter}`;

const keyOf = (text) => String(text || '').trim().toLowerCase();

const childKey = (c) => `${keyOf(c.firstName)}|${keyOf(c.lastName)}`;

/**
 * Prefer a contact channel for identity: parents retype their own name inconsistently
 * ("Sophie" one year, "Sophie Müller-Bühler" the next) but an address or number is stable.
 */
function caregiverKey(c) {
  if (c.email) return `e:${keyOf(c.email)}`;
  if (c.mobile) return `m:${keyOf(c.mobile)}`;
  return `n:${keyOf(c.firstName)}|${keyOf(c.lastName)}`;
}

/**
 * Find the child a submission is about.
 *
 * Surnames get left blank often enough that an exact key match alone creates duplicates:
 * a parent enters "Léa", later adds "Müller", and the class has two Léas in the file.
 * But loosening the match to first-name-only is worse, because two children in one class
 * really do share a first name, and attaching a family to the wrong child is a mistake
 * nobody would catch by reading the list.
 *
 * So it merges only where the answer is unambiguous — exactly one candidate — and
 * otherwise creates a separate child and leaves the delegate to see two similar entries.
 * A visible duplicate is a much cheaper error than a silent mix-up.
 */
function findChild(project, child) {
  const exact = project.children.find((c) => childKey(c) === childKey(child));
  if (exact) return exact;

  const sameFirstName = project.children.filter(
    (c) => keyOf(c.firstName) === keyOf(child.firstName));

  if (!child.lastName) {
    // No surname given: attach to the one child with this first name, if there is one.
    return sameFirstName.length === 1 ? sameFirstName[0] : null;
  }
  // Surname given: fill it into the one nameless child with this first name, if there is one.
  const nameless = sameFirstName.filter((c) => !c.lastName);
  return nameless.length === 1 ? nameless[0] : null;
}

function normalizeCaregiver(raw) {
  const email = raw.email ? normalizeEmail(raw.email) : null;
  const phone = raw.mobile ? normalizePhone(raw.mobile) : null;
  const notes = [];
  if (raw.email && !email.ok) {
    notes.push({ code: 'email-unreadable', text: `E-Mail nicht lesbar: ${raw.email}` });
  }
  if (email?.suggestion) {
    notes.push({ code: 'email-typo',
      text: `Tippfehler in der E-Mail? ${email.value} → ${email.suggestion}` });
  }
  if (raw.mobile && !phone.ok) {
    notes.push({ code: 'mobile-unreadable', text: `Nummer nicht lesbar: ${raw.mobile}` });
  }

  const a = raw.address;
  const address = a && (a.street || a.postcode || a.town)
    ? {
        street: String(a.street || '').trim(),
        postcode: String(a.postcode || '').trim(),
        town: normalizeName(a.town || ''),
      }
    : null;

  return {
    caregiver: {
      firstName: normalizeName(raw.firstName || ''),
      lastName: normalizeName(raw.lastName || ''),
      role: String(raw.role || '').trim(),
      email: email?.ok ? email.value : '',
      mobile: phone?.ok ? phone.e164 : '',
      mobileDisplay: phone?.ok ? phone.display : '',
      mobileType: phone?.ok ? phone.type : '',
      address,
    },
    notes,
  };
}

/** German labels for the fields whose change is worth telling a delegate about. */
const REPORTABLE = {
  firstName: 'Vorname', lastName: 'Nachname', role: 'Rolle',
  email: 'E-Mail', mobile: 'Mobilnummer',
};
const DERIVED = ['mobileDisplay', 'mobileType'];

/**
 * Copy incoming values over stored ones — but never clear a stored value with an empty
 * incoming one.
 *
 * This is the rule that lets separated parents each submit their own form without any
 * instruction on the paper telling them to. A submission that names one person must not
 * blank out what the other person supplied, and a form left partly empty must not erase
 * last month's answer.
 */
function copyNonEmpty(target, incoming) {
  const changes = [];
  for (const field of Object.keys(REPORTABLE)) {
    if (incoming[field] && incoming[field] !== target[field]) {
      if (target[field]) {
        changes.push(`${REPORTABLE[field]}: ${target[field]} → ${incoming[field]}`);
      }
      target[field] = incoming[field];
    }
  }
  // Derived from the mobile number, so a change here is not news on its own.
  for (const field of DERIVED) if (incoming[field]) target[field] = incoming[field];

  if (incoming.address) {
    target.address = target.address ? { ...target.address } : {};
    for (const field of ['street', 'postcode', 'town']) {
      if (incoming.address[field]) target.address[field] = incoming.address[field];
    }
  }
  return changes;
}

const JA_NEIN = (v) => (v === UNKNOWN ? 'unbekannt' : v ? 'ja' : 'nein');

function consentFrom(s, now) {
  // No consent block at all means nobody ever asked — an old list, a WhatsApp group, last
  // year's file. That is not a "no", and it must not be treated as one.
  if (!s.consent) {
    return {
      classList: UNKNOWN, whatsappGroup: UNKNOWN,
      recordedAt: '', source: 'legacy', noticeVersion: '',
    };
  }
  return {
    classList: !!s.consent.classList,
    whatsappGroup: !!s.consent.whatsappGroup,
    recordedAt: s.date || now || '',
    source: s.source || 'form',
    noticeVersion: s.noticeVersion || '',
  };
}

/**
 * Take one submission into the project.
 * @returns {{outcome: 'new'|'updated'|'unchanged', children: string[],
 *            notes: {code: string, text: string}[], changes: string[]}}
 *   `changes` are German sentences for the confirmation step, display only.
 */
export function ingestSubmission(project, s, opts = {}) {
  const now = opts.now || '';
  const notes = [];
  const changes = [];
  let somethingNew = false;

  const childIds = [];
  for (const rawChild of s.children || []) {
    const child = {
      firstName: normalizeName(rawChild.firstName || ''),
      lastName: normalizeName(rawChild.lastName || ''),
    };
    if (!child.firstName && !child.lastName) continue;
    let existing = findChild(project, child);
    if (!existing) {
      existing = { id: nextId(project, 'k'), ...child };
      project.children.push(existing);
      somethingNew = true;
    } else if (child.lastName && !existing.lastName) {
      existing.lastName = child.lastName;   // a later submission filled in the surname
      changes.push(`Nachname ergänzt: ${existing.firstName} ${child.lastName}`);
    }
    childIds.push(existing.id);
  }

  const consent = consentFrom(s, now);

  for (const rawCaregiver of s.caregivers || []) {
    const { caregiver, notes: n } = normalizeCaregiver(rawCaregiver);
    notes.push(...n);
    if (!caregiver.firstName && !caregiver.lastName && !caregiver.email && !caregiver.mobile) {
      continue;
    }

    const key = caregiverKey(caregiver);
    let existing = project.caregivers.find((c) => caregiverKey(c) === key);
    if (!existing) {
      existing = { id: nextId(project, 'p'), ...caregiver, children: [], consent };
      project.caregivers.push(existing);
      somethingNew = true;
    } else {
      changes.push(...copyNonEmpty(existing, caregiver));
      // An explicit answer always wins, including over an earlier one: this is how a
      // withdrawal takes effect.
      if (s.consent) {
        if (existing.consent.classList !== consent.classList) {
          changes.push(`Klassenliste: ${JA_NEIN(existing.consent.classList)} → ${JA_NEIN(consent.classList)}`);
        }
        if (existing.consent.whatsappGroup !== consent.whatsappGroup) {
          changes.push(`WhatsApp-Gruppe: ${JA_NEIN(existing.consent.whatsappGroup)} → ${JA_NEIN(consent.whatsappGroup)}`);
        }
        existing.consent = consent;
      }
    }
    for (const id of childIds) if (!existing.children.includes(id)) existing.children.push(id);
  }

  const outcome = somethingNew ? 'new' : (changes.length ? 'updated' : 'unchanged');
  project.log.push({
    at: now,
    kind: 'submission',
    text: `${outcome}: ${(s.children || []).map((c) => c.firstName).join(', ') || 'ohne Kind'}`,
  });
  return { outcome, children: childIds, notes, changes };
}

// ---------------------------------------------------------------- queries

export const caregiversForChild = (project, childId) =>
  project.caregivers.filter((c) => c.children.includes(childId));

/** Only people who said yes belong in anything shared with other parents. */
export const forClassList = (project) =>
  project.caregivers.filter((c) => c.consent.classList === true);

export const forWhatsappGroup = (project) =>
  project.caregivers.filter((c) => c.consent.whatsappGroup === true && c.mobile);

/** People whose consent was never recorded. They stay out of shared output until asked. */
export const consentUnrecorded = (project) =>
  project.caregivers.filter((c) => c.consent.classList === UNKNOWN);

/**
 * Roster reconciliation: which children on the class list have nobody attached yet.
 * @param {string[]} roster names as written on the class list
 */
export function missingChildren(project, roster) {
  const covered = new Set(project.children
    .filter((c) => caregiversForChild(project, c.id).length > 0)
    .map((c) => childKey(c)));
  return (roster || []).filter((name) => {
    const parts = String(name).trim().split(/\s+/);
    const child = { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
    if (covered.has(childKey(child))) return false;
    // A roster entry with only a first name still matches a child recorded with a surname.
    if (!child.lastName) {
      return ![...covered].some((k) => k.startsWith(`${keyOf(child.firstName)}|`));
    }
    return true;
  });
}

// ---------------------------------------------------------------- persistence

export const projectToJson = (project) => JSON.stringify(project, null, 1);

/** @returns {{ok: true, project: object} | {ok: false, code: string, text: string}} */
export function projectFromJson(text) {
  const fail = (code, message) => ({ ok: false, code, text: message });
  let p;
  try { p = JSON.parse(text); } catch { return fail('invalid-file', 'Keine gültige Datei.'); }
  if (!p || typeof p !== 'object') return fail('invalid-file', 'Keine gültige Datei.');
  if (p.v !== PROJECT_VERSION) {
    return fail('version-mismatch', `Unbekannte Dateiversion ${p.v}.`);
  }
  for (const field of ['children', 'caregivers', 'log']) {
    if (!Array.isArray(p[field])) return fail('missing-field', `Im Feld ${field} fehlen Angaben.`);
  }
  return { ok: true, project: p };
}

export function deleteCaregiver(project, caregiverId, now = '') {
  const i = project.caregivers.findIndex((c) => c.id === caregiverId);
  if (i === -1) return false;
  const [gone] = project.caregivers.splice(i, 1);
  project.log.push({ at: now, kind: 'deletion', text: `${gone.firstName} ${gone.lastName}` });
  // Children nobody is attached to any more go too: keeping them would leave a name in the
  // file with no purpose, and the point of the year-end routine is that nothing lingers.
  project.children = project.children.filter(
    (c) => caregiversForChild(project, c.id).length > 0);
  return true;
}
