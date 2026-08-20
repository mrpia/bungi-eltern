// Parent form behaviour.
//
// Everything happens in this browser. There is no submit target: the page assembles a
// message and hands it to WhatsApp or the mail app, which is a navigation the parent
// initiates. The page's CSP has no connect-src, so it could not send anything even if a
// future edit tried to.

import { normalizePhone } from '/assets/core/phone.js';
import { normalizeEmail } from '/assets/core/email.js';
import { normalizeName } from '/assets/core/names.js';
import { submissionMessage } from '/assets/core/payload.js';

const meta = (name, fallback = '') =>
  document.querySelector(`meta[name="kk-${name}"]`)?.content || fallback;

const KONTEXT = {
  klasse: meta('klasse'),
  slug: meta('slug'),
  jahr: meta('jahr'),
  schule: meta('schule'),
  merkblatt: meta('merkblatt'),
  basis: meta('basis'),
};

// Optional: a delegate who shared their own link prefills the recipient. Absent when the
// parent came from the printed QR code, which is the normal case at the start of the year.
const EMPFAENGER = new URLSearchParams(location.search).get('d')?.trim() || '';
const empfaengerIstMail = EMPFAENGER.includes('@');

const T = {
  de: {
    kindFehlt: 'Bitte den Vornamen des Kindes angeben.',
    kontaktFehlt: 'Bitte eine E-Mail-Adresse oder eine Mobilnummer angeben, damit die Delegierten Sie erreichen können.',
    nameFehlt: 'Bitte Ihren Vornamen angeben.',
    telUnklar: 'Diese Nummer können wir nicht lesen. Beispiel: 079 123 45 67',
    telOk: (s) => `Gespeichert als ${s}`,
    mailUnklar: 'Diese E-Mail-Adresse sieht nicht vollständig aus.',
    mailTipp: (s) => `Meinten Sie ${s}?`,
    uebernehmen: 'übernehmen',
    empfaengerLeer: 'WhatsApp oder Ihr Mailprogramm fragt Sie, an wen die Nachricht geht. Wählen Sie Ihre Klassendelegierten.',
    offeneWarnung: 'Bitte noch einmal anschauen:',
    empfaengerDa: (e) => `Die Nachricht geht an ${e}.`,
    betreff: (k) => `Kontaktangaben ${k}`,
  },
  en: {
    kindFehlt: "Please give your child's first name.",
    kontaktFehlt: 'Please give an email address or a mobile number so the delegates can reach you.',
    nameFehlt: 'Please give your first name.',
    telUnklar: 'We cannot read this number. Example: 079 123 45 67',
    telOk: (s) => `Stored as ${s}`,
    mailUnklar: 'This email address does not look complete.',
    mailTipp: (s) => `Did you mean ${s}?`,
    uebernehmen: 'use it',
    empfaengerLeer: 'WhatsApp or your mail app will ask who to send to. Pick your class delegates.',
    offeneWarnung: 'Worth another look:',
    empfaengerDa: (e) => `The message goes to ${e}.`,
    betreff: (k) => `Contact details ${k}`,
  },
};

let sprache = 'de';
const t = () => T[sprache];

// ---------------------------------------------------------------- language toggle

function spracheSetzen(neu) {
  sprache = neu;
  // The German text is what stands in the markup, so switching back means restoring it.
  for (const el of document.querySelectorAll('[data-en]')) {
    if (!el.dataset.de) el.dataset.de = el.innerHTML;
    el.innerHTML = neu === 'en' ? el.dataset.en : el.dataset.de;
  }
  document.documentElement.lang = neu;
  document.getElementById('sprache').textContent = neu === 'en' ? 'Deutsch' : 'English';
  hinweiseNeuZeichnen();
  // Text written by script is not covered by the [data-en] swap above, so it has to be
  // redrawn explicitly. Forgetting this is how half a page ends up in the wrong language.
  dynamischeTexteZeichnen();
}

/** Redraws everything this script writes rather than the markup declaring. */
function dynamischeTexteZeichnen() {
  const hinweis = document.getElementById('empfaenger-hinweis');
  if (hinweis && !document.getElementById('pruefen-bereich').classList.contains('versteckt')) {
    hinweis.textContent = EMPFAENGER ? t().empfaengerDa(EMPFAENGER) : t().empfaengerLeer;
  }
  offeneWarnungenZeichnen();
}

/**
 * Repeats field warnings the parent did not resolve, on the review screen.
 *
 * A review screen that looks tidy while an address is still misspelt launders the problem:
 * the parent reads a clean summary, sends it, and the delegate gets a bouncing address.
 * The suggestion is still never applied automatically — it is only shown again.
 */
function offeneWarnungenZeichnen() {
  const behaelter = document.getElementById('offene-warnungen');
  if (!behaelter) return;
  const offen = [...notizen.values()].filter((n) => n.art === 'warn' && n.text);
  if (offen.length === 0) { behaelter.classList.add('versteckt'); behaelter.textContent = ''; return; }
  behaelter.className = 'fehler';
  behaelter.textContent = `${t().offeneWarnung} ${offen.map((n) => n.text()).join(' · ')}`;
}

document.getElementById('sprache').addEventListener('click', () => {
  spracheSetzen(sprache === 'de' ? 'en' : 'de');
});

// ---------------------------------------------------------------- header from meta

document.getElementById('kopf-klasse').textContent = KONTEXT.klasse;
document.getElementById('kopf-jahr').textContent = KONTEXT.jahr;
document.getElementById('kopf-schule').textContent = KONTEXT.schule;
document.title = `${KONTEXT.klasse} — Kontaktangaben`;

// ---------------------------------------------------------------- progressive disclosure

for (const knopf of document.querySelectorAll('[data-adresse-knopf]')) {
  knopf.addEventListener('click', () => {
    knopf.nextElementSibling.classList.remove('versteckt');
    knopf.classList.add('versteckt');
    knopf.nextElementSibling.querySelector('input')?.focus();
  });
}

document.getElementById('person2-knopf').addEventListener('click', (e) => {
  document.getElementById('person2').classList.remove('versteckt');
  e.target.classList.add('versteckt');
  document.getElementById('person2').querySelector('input')?.focus();
});

// ---------------------------------------------------------------- live field feedback

/** Remembers what each field's note should say, so a language switch can redraw it. */
const notizen = new Map();

function notiz(feld, art, text, aktion) {
  const p = feld.closest('label').querySelector('[data-hinweis]');
  if (!p) return;
  notizen.set(p, { art, text, aktion });
  zeichnen(p);
}

function zeichnen(p) {
  const n = notizen.get(p);
  if (!n || !n.text) { p.classList.add('versteckt'); p.textContent = ''; return; }
  p.className = `hinweis ${n.art}`;
  p.textContent = n.text();
  if (n.aktion) {
    p.append(' ');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t().uebernehmen;
    b.addEventListener('click', n.aktion);
    p.append(b);
  }
}

const hinweiseNeuZeichnen = () => notizen.forEach((_, p) => zeichnen(p));

for (const feld of document.querySelectorAll('[data-rolle="mobil"]')) {
  feld.addEventListener('blur', () => {
    const roh = feld.value.trim();
    if (!roh) return notiz(feld, '', null);
    const r = normalizePhone(roh);
    if (r.ok) {
      feld.value = r.display;
      notiz(feld, 'gut', () => t().telOk(r.display));
    } else {
      notiz(feld, 'warn', () => t().telUnklar);
    }
  });
}

for (const feld of document.querySelectorAll('[data-rolle="email"]')) {
  feld.addEventListener('blur', () => {
    const roh = feld.value.trim();
    if (!roh) return notiz(feld, '', null);
    const r = normalizeEmail(roh);
    if (!r.ok) return notiz(feld, 'warn', () => t().mailUnklar);
    feld.value = r.value;
    // A suggestion is offered, never applied: silently rewriting an address is how a
    // family stops getting mail without anyone noticing.
    if (r.suggestion) {
      notiz(feld, 'warn', () => t().mailTipp(r.suggestion), () => {
        feld.value = r.suggestion;
        notiz(feld, '', null);
      });
    } else {
      notiz(feld, '', null);
    }
  });
}

for (const feld of document.querySelectorAll('[data-rolle="vorname"], [data-rolle="nachname"], #kind-vorname, #kind-nachname')) {
  feld.addEventListener('blur', () => { feld.value = normalizeName(feld.value); });
}

// ---------------------------------------------------------------- collect and validate

function personLesen(id) {
  const wurzel = document.getElementById(id);
  if (!wurzel || wurzel.classList.contains('versteckt')) return null;
  const v = (rolle) => wurzel.querySelector(`[data-rolle="${rolle}"]`)?.value.trim() || '';
  const person = {
    vorname: v('vorname'), nachname: v('nachname'), rolle: v('rolle'),
    email: v('email'), mobil: v('mobil'),
  };
  const adresse = { strasse: v('strasse'), plz: v('plz'), ort: v('ort') };
  if (adresse.strasse || adresse.plz || adresse.ort) person.adresse = adresse;
  const etwas = person.vorname || person.nachname || person.email || person.mobil;
  return etwas ? person : null;
}

function einreichungBauen() {
  const kind = {
    vorname: document.getElementById('kind-vorname').value.trim(),
    nachname: document.getElementById('kind-nachname').value.trim(),
  };
  const personen = [personLesen('person1'), personLesen('person2')].filter(Boolean);
  return {
    klasse: KONTEXT.klasse,
    schuljahr: KONTEXT.jahr,
    merkblatt: KONTEXT.merkblatt,
    datum: new Date().toISOString().slice(0, 10),
    kinder: kind.vorname || kind.nachname ? [kind] : [],
    personen,
    einwilligung: {
      liste: document.getElementById('zust-liste').checked,
      whatsapp: document.getElementById('zust-whatsapp').checked,
    },
  };
}

function pruefen(s) {
  if (!s.kinder.length || !s.kinder[0].vorname) return t().kindFehlt;
  const p = s.personen[0];
  if (!p || !p.vorname) return t().nameFehlt;
  if (!p.email && !p.mobil) return t().kontaktFehlt;
  return null;
}

const fehlerFeld = document.getElementById('fehler');
function fehlerZeigen(text) {
  if (!text) { fehlerFeld.classList.add('versteckt'); return; }
  fehlerFeld.textContent = text;
  fehlerFeld.classList.remove('versteckt');
  fehlerFeld.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ---------------------------------------------------------------- review and send

let nachricht = null;

document.getElementById('weiter').addEventListener('click', () => {
  const s = einreichungBauen();
  const problem = pruefen(s);
  if (problem) return fehlerZeigen(problem);
  fehlerZeigen(null);

  nachricht = submissionMessage(s, KONTEXT.basis);
  document.getElementById('zusammenfassung').textContent = nachricht.text;
  document.getElementById('formular').classList.add('versteckt');
  document.getElementById('pruefen-bereich').classList.remove('versteckt');
  dynamischeTexteZeichnen();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('zurueck').addEventListener('click', () => {
  document.getElementById('pruefen-bereich').classList.add('versteckt');
  document.getElementById('formular').classList.remove('versteckt');
});

document.getElementById('senden-whatsapp').addEventListener('click', () => {
  // No number in the URL means WhatsApp opens its own contact picker, which is exactly
  // what is needed when the delegates were only elected this evening.
  const ziel = EMPFAENGER && !empfaengerIstMail ? EMPFAENGER.replace(/[^\d]/g, '') : '';
  location.href = `https://wa.me/${ziel}?text=${encodeURIComponent(nachricht.text)}`;
});

document.getElementById('senden-mail').addEventListener('click', () => {
  const an = EMPFAENGER && empfaengerIstMail ? encodeURIComponent(EMPFAENGER) : '';
  const betreff = encodeURIComponent(t().betreff(KONTEXT.klasse));
  location.href = `mailto:${an}?subject=${betreff}&body=${encodeURIComponent(nachricht.text)}`;
});
