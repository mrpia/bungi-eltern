// Parent form behaviour.
//
// Everything happens in this browser. There is no submit target: the page assembles a
// message and hands it to WhatsApp or the mail app, which is a navigation the parent
// initiates. The page's CSP has no connect-src, so it could not send anything even if a
// future edit tried to.
//
// Identifiers and comments are English; every string a parent reads is German, with an
// English translation alongside it.

import { normalizePhone } from '/assets/core/phone.js';
import { normalizeEmail } from '/assets/core/email.js';
import { normalizeName } from '/assets/core/names.js';
import { submissionMessage } from '/assets/core/payload.js';

const meta = (name, fallback = '') =>
  document.querySelector(`meta[name="kk-${name}"]`)?.content || fallback;

const CONTEXT = {
  classLabel: meta('klasse'),
  slug: meta('slug'),
  schoolYear: meta('jahr'),
  school: meta('schule'),
  noticeVersion: meta('merkblatt'),
  baseUrl: meta('basis'),
};

// Optional: a delegate who shared their own link prefills the recipient. Absent when the
// parent came from the printed QR code, which is the normal case at the start of the year.
const RECIPIENT = new URLSearchParams(location.search).get('d')?.trim() || '';
const recipientIsEmail = RECIPIENT.includes('@');

const TEXT = {
  de: {
    childMissing: 'Bitte den Vornamen des Kindes angeben.',
    contactMissing: 'Bitte eine E-Mail-Adresse oder eine Mobilnummer angeben, damit die Delegierten Sie erreichen können.',
    nameMissing: 'Bitte Ihren Vornamen angeben.',
    phoneUnclear: 'Diese Nummer können wir nicht lesen. Beispiel: 079 123 45 67',
    phoneOk: (s) => `Gespeichert als ${s}`,
    emailUnclear: 'Diese E-Mail-Adresse sieht nicht vollständig aus.',
    emailHint: (s) => `Meinten Sie ${s}?`,
    apply: 'übernehmen',
    openWarnings: 'Bitte noch einmal anschauen:',
    recipientEmpty: 'WhatsApp oder Ihr Mailprogramm fragt Sie, an wen die Nachricht geht. Wählen Sie Ihre Klassendelegierten.',
    recipientKnown: (r) => `Die Nachricht geht an ${r}.`,
    subject: (c) => `Kontaktangaben ${c}`,
  },
  en: {
    childMissing: "Please give your child's first name.",
    contactMissing: 'Please give an email address or a mobile number so the delegates can reach you.',
    nameMissing: 'Please give your first name.',
    phoneUnclear: 'We cannot read this number. Example: 079 123 45 67',
    phoneOk: (s) => `Stored as ${s}`,
    emailUnclear: 'This email address does not look complete.',
    emailHint: (s) => `Did you mean ${s}?`,
    apply: 'use it',
    openWarnings: 'Worth another look:',
    recipientEmpty: 'WhatsApp or your mail app will ask who to send to. Pick your class delegates.',
    recipientKnown: (r) => `The message goes to ${r}.`,
    subject: (c) => `Contact details ${c}`,
  },
};

let language = 'de';
const t = () => TEXT[language];

// ---------------------------------------------------------------- language toggle

function setLanguage(next) {
  language = next;
  // The German text is what stands in the markup, so switching back means restoring it.
  for (const el of document.querySelectorAll('[data-en]')) {
    if (!el.dataset.de) el.dataset.de = el.innerHTML;
    el.innerHTML = next === 'en' ? el.dataset.en : el.dataset.de;
  }
  document.documentElement.lang = next;
  document.getElementById('sprache').textContent = next === 'en' ? 'Deutsch' : 'English';
  redrawFieldNotes();
  // Text written by script is not covered by the [data-en] swap above, so it has to be
  // redrawn explicitly. Forgetting this is how half a page ends up in the wrong language.
  redrawScriptText();
}

document.getElementById('sprache').addEventListener('click', () => {
  setLanguage(language === 'de' ? 'en' : 'de');
});

// ---------------------------------------------------------------- header from meta

document.getElementById('kopf-klasse').textContent = CONTEXT.classLabel;
document.getElementById('kopf-jahr').textContent = CONTEXT.schoolYear;
document.getElementById('kopf-schule').textContent = CONTEXT.school;
document.title = `${CONTEXT.classLabel} — Kontaktangaben`;

// ---------------------------------------------------------------- progressive disclosure

for (const button of document.querySelectorAll('[data-adresse-knopf]')) {
  button.addEventListener('click', () => {
    button.nextElementSibling.classList.remove('versteckt');
    button.classList.add('versteckt');
    button.nextElementSibling.querySelector('input')?.focus();
  });
}

document.getElementById('person2-knopf').addEventListener('click', (e) => {
  document.getElementById('person2').classList.remove('versteckt');
  e.target.classList.add('versteckt');
  document.getElementById('person2').querySelector('input')?.focus();
});

// ---------------------------------------------------------------- live field feedback

/** Remembers what each field's note should say, so a language switch can redraw it. */
const fieldNotes = new Map();

function setNote(field, kind, text, action) {
  const p = field.closest('label').querySelector('[data-hinweis]');
  if (!p) return;
  fieldNotes.set(p, { kind, text, action });
  drawNote(p);
}

function drawNote(p) {
  const note = fieldNotes.get(p);
  if (!note || !note.text) { p.classList.add('versteckt'); p.textContent = ''; return; }
  p.className = `hinweis ${note.kind}`;
  p.textContent = note.text();
  if (note.action) {
    p.append(' ');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t().apply;
    button.addEventListener('click', note.action);
    p.append(button);
  }
}

const redrawFieldNotes = () => fieldNotes.forEach((_, p) => drawNote(p));

for (const field of document.querySelectorAll('[data-rolle="mobil"]')) {
  field.addEventListener('blur', () => {
    const raw = field.value.trim();
    if (!raw) return setNote(field, '', null);
    const r = normalizePhone(raw);
    if (r.ok) {
      field.value = r.display;
      setNote(field, 'gut', () => t().phoneOk(r.display));
    } else {
      setNote(field, 'warn', () => t().phoneUnclear);
    }
  });
}

for (const field of document.querySelectorAll('[data-rolle="email"]')) {
  field.addEventListener('blur', () => {
    const raw = field.value.trim();
    if (!raw) return setNote(field, '', null);
    const r = normalizeEmail(raw);
    if (!r.ok) return setNote(field, 'warn', () => t().emailUnclear);
    field.value = r.value;
    // A suggestion is offered, never applied: silently rewriting an address is how a
    // family stops getting mail without anyone noticing.
    if (r.suggestion) {
      setNote(field, 'warn', () => t().emailHint(r.suggestion), () => {
        field.value = r.suggestion;
        setNote(field, '', null);
      });
    } else {
      setNote(field, '', null);
    }
  });
}

const NAME_FIELDS = '[data-rolle="vorname"], [data-rolle="nachname"], #kind-vorname, #kind-nachname';
for (const field of document.querySelectorAll(NAME_FIELDS)) {
  field.addEventListener('blur', () => { field.value = normalizeName(field.value); });
}

// ---------------------------------------------------------------- collect and validate

function readCaregiver(sectionId) {
  const root = document.getElementById(sectionId);
  if (!root || root.classList.contains('versteckt')) return null;
  const v = (role) => root.querySelector(`[data-rolle="${role}"]`)?.value.trim() || '';
  const caregiver = {
    firstName: v('vorname'), lastName: v('nachname'), role: v('rolle'),
    email: v('email'), mobile: v('mobil'),
  };
  const address = { street: v('strasse'), postcode: v('plz'), town: v('ort') };
  if (address.street || address.postcode || address.town) caregiver.address = address;
  const anything = caregiver.firstName || caregiver.lastName || caregiver.email || caregiver.mobile;
  return anything ? caregiver : null;
}

function buildSubmission() {
  const child = {
    firstName: document.getElementById('kind-vorname').value.trim(),
    lastName: document.getElementById('kind-nachname').value.trim(),
  };
  const caregivers = [readCaregiver('person1'), readCaregiver('person2')].filter(Boolean);
  return {
    classLabel: CONTEXT.classLabel,
    schoolYear: CONTEXT.schoolYear,
    noticeVersion: CONTEXT.noticeVersion,
    date: new Date().toISOString().slice(0, 10),
    children: child.firstName || child.lastName ? [child] : [],
    caregivers,
    consent: {
      classList: document.getElementById('zust-liste').checked,
      whatsappGroup: document.getElementById('zust-whatsapp').checked,
    },
  };
}

function validate(s) {
  if (!s.children.length || !s.children[0].firstName) return t().childMissing;
  const first = s.caregivers[0];
  if (!first || !first.firstName) return t().nameMissing;
  if (!first.email && !first.mobile) return t().contactMissing;
  return null;
}

const errorBox = document.getElementById('fehler');
function showError(text) {
  if (!text) { errorBox.classList.add('versteckt'); return; }
  errorBox.textContent = text;
  errorBox.classList.remove('versteckt');
  errorBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ---------------------------------------------------------------- review and send

/** Redraws everything this script writes rather than the markup declaring. */
function redrawScriptText() {
  const hint = document.getElementById('empfaenger-hinweis');
  if (hint && !document.getElementById('pruefen-bereich').classList.contains('versteckt')) {
    hint.textContent = RECIPIENT ? t().recipientKnown(RECIPIENT) : t().recipientEmpty;
  }
  drawOpenWarnings();
}

/**
 * Repeats field warnings the parent did not resolve, on the review screen.
 *
 * A review screen that looks tidy while an address is still misspelt launders the problem:
 * the parent reads a clean summary, sends it, and the delegate gets a bouncing address.
 * The suggestion is still never applied automatically — it is only shown again.
 */
function drawOpenWarnings() {
  const box = document.getElementById('offene-warnungen');
  if (!box) return;
  const open = [...fieldNotes.values()].filter((n) => n.kind === 'warn' && n.text);
  if (open.length === 0) { box.classList.add('versteckt'); box.textContent = ''; return; }
  box.className = 'fehler';
  box.textContent = `${t().openWarnings} ${open.map((n) => n.text()).join(' · ')}`;
}

let message = null;

document.getElementById('weiter').addEventListener('click', () => {
  const s = buildSubmission();
  const problem = validate(s);
  if (problem) return showError(problem);
  showError(null);

  message = submissionMessage(s, CONTEXT.baseUrl);
  document.getElementById('zusammenfassung').textContent = message.text;
  document.getElementById('formular').classList.add('versteckt');
  document.getElementById('pruefen-bereich').classList.remove('versteckt');
  redrawScriptText();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('zurueck').addEventListener('click', () => {
  document.getElementById('pruefen-bereich').classList.add('versteckt');
  document.getElementById('formular').classList.remove('versteckt');
});

document.getElementById('senden-whatsapp').addEventListener('click', () => {
  // No number in the URL means WhatsApp opens its own contact picker, which is exactly
  // what is needed when the delegates were only elected this evening.
  const target = RECIPIENT && !recipientIsEmail ? RECIPIENT.replace(/[^\d]/g, '') : '';
  location.href = `https://wa.me/${target}?text=${encodeURIComponent(message.text)}`;
});

document.getElementById('senden-mail').addEventListener('click', () => {
  const to = RECIPIENT && recipientIsEmail ? encodeURIComponent(RECIPIENT) : '';
  const subject = encodeURIComponent(t().subject(CONTEXT.classLabel));
  location.href = `mailto:${to}?subject=${subject}&body=${encodeURIComponent(message.text)}`;
});
