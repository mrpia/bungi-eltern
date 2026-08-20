// The delegate's dataset and the rules for growing it.
//
// Three entities, not four: the form no longer declares who lives with whom, so a
// household is not stored. The address rides on the person, and the grouping key for every
// output is the child.
//
// Normalisation happens here, on the way in. Nothing downstream — no list, no vCard, no
// CSV — should ever have to wonder whether a value was cleaned. If raw input can reach a
// renderer, one export path will eventually be clean and another will not.

import { normalizeName } from './names.js';
import { normalizeEmail } from './email.js';
import { normalizePhone } from './phone.js';

export const PROJEKT_VERSION = 1;

/** Consent that was never recorded. Distinct from a recorded "no". */
export const UNBEKANNT = null;

export function neuesProjekt({ klasse, schuljahr, startSchuljahr, jetzt }) {
  return {
    v: PROJEKT_VERSION,
    klasse: klasse || '',
    schuljahr: schuljahr || '',
    startSchuljahr: startSchuljahr || schuljahr || '',
    erstellt: jetzt || '',
    zaehler: 0,
    kinder: [],
    personen: [],
    protokoll: [],
  };
}

const id = (projekt, praefix) => `${praefix}${++projekt.zaehler}`;

const schluessel = (text) => String(text || '').trim().toLowerCase();

const kindSchluessel = (k) => `${schluessel(k.vorname)}|${schluessel(k.nachname)}`;

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
function kindFinden(projekt, kind) {
  const genau = projekt.kinder.find((k) => kindSchluessel(k) === kindSchluessel(kind));
  if (genau) return genau;

  const gleicherVorname = projekt.kinder.filter((k) => schluessel(k.vorname) === schluessel(kind.vorname));

  if (!kind.nachname) {
    // No surname given: attach to the one child with this first name, if there is one.
    return gleicherVorname.length === 1 ? gleicherVorname[0] : null;
  }
  // Surname given: fill it into the one nameless child with this first name, if there is one.
  const ohneNachname = gleicherVorname.filter((k) => !k.nachname);
  return ohneNachname.length === 1 ? ohneNachname[0] : null;
}

/**
 * Prefer a contact channel for identity: parents retype their own name inconsistently
 * ("Sophie" one year, "Sophie Müller-Bühler" the next) but an address or number is stable.
 */
function personSchluessel(p) {
  if (p.email) return `e:${schluessel(p.email)}`;
  if (p.mobil) return `m:${schluessel(p.mobil)}`;
  return `n:${schluessel(p.vorname)}|${schluessel(p.nachname)}`;
}

function personNormalisieren(rohe) {
  const email = rohe.email ? normalizeEmail(rohe.email) : null;
  const tel = rohe.mobil ? normalizePhone(rohe.mobil) : null;
  const hinweise = [];
  if (rohe.email && !email.ok) hinweise.push(`E-Mail unlesbar: ${rohe.email}`);
  if (email?.suggestion) hinweise.push(`E-Mail-Tippfehler? ${email.value} → ${email.suggestion}`);
  if (rohe.mobil && !tel.ok) hinweise.push(`Nummer unlesbar: ${rohe.mobil}`);

  const adresse = rohe.adresse && (rohe.adresse.strasse || rohe.adresse.plz || rohe.adresse.ort)
    ? {
        strasse: String(rohe.adresse.strasse || '').trim(),
        plz: String(rohe.adresse.plz || '').trim(),
        ort: normalizeName(rohe.adresse.ort || ''),
      }
    : null;

  return {
    person: {
      vorname: normalizeName(rohe.vorname || ''),
      nachname: normalizeName(rohe.nachname || ''),
      rolle: String(rohe.rolle || '').trim(),
      email: email?.ok ? email.value : '',
      mobil: tel?.ok ? tel.e164 : '',
      mobilAnzeige: tel?.ok ? tel.display : '',
      mobilArt: tel?.ok ? tel.type : '',
      adresse,
    },
    hinweise,
  };
}

/**
 * Copy incoming values over stored ones — but never clear a stored value with an empty
 * incoming one.
 *
 * This is the rule that lets separated parents each submit their own form without any
 * instruction on the paper telling them to. A submission that names one person must not
 * blank out what the other person supplied, and a form left partly empty must not erase
 * last month's answer.
 */
function feldweiseUebernehmen(ziel, neu) {
  const geaendert = [];
  for (const feld of ['vorname', 'nachname', 'rolle', 'email', 'mobil', 'mobilAnzeige', 'mobilArt']) {
    if (neu[feld] && neu[feld] !== ziel[feld]) {
      if (ziel[feld]) geaendert.push(`${feld}: ${ziel[feld]} → ${neu[feld]}`);
      ziel[feld] = neu[feld];
    }
  }
  if (neu.adresse) {
    ziel.adresse = ziel.adresse ? { ...ziel.adresse } : {};
    for (const feld of ['strasse', 'plz', 'ort']) {
      if (neu.adresse[feld]) ziel.adresse[feld] = neu.adresse[feld];
    }
  }
  return geaendert;
}

function einwilligungAus(s, jetzt) {
  // No consent block at all means nobody ever asked — an old list, a WhatsApp group, last
  // year's file. That is not a "no", and it must not be treated as one.
  if (!s.einwilligung) {
    return { liste: UNBEKANNT, whatsapp: UNBEKANNT, erfasst: '', quelle: 'altbestand', merkblatt: '' };
  }
  return {
    liste: !!s.einwilligung.liste,
    whatsapp: !!s.einwilligung.whatsapp,
    erfasst: s.datum || jetzt || '',
    quelle: s.quelle || 'formular',
    merkblatt: s.merkblatt || '',
  };
}

/**
 * Take one submission into the project.
 * @returns {{ergebnis: 'neu'|'ergaenzt'|'unveraendert', kinder: string[], hinweise: string[], aenderungen: string[]}}
 */
export function einreichungAufnehmen(projekt, s, opts = {}) {
  const jetzt = opts.jetzt || '';
  const hinweise = [];
  const aenderungen = [];
  let etwasNeu = false;

  const kindIds = [];
  for (const rohesKind of s.kinder || []) {
    const kind = {
      vorname: normalizeName(rohesKind.vorname || ''),
      nachname: normalizeName(rohesKind.nachname || ''),
    };
    if (!kind.vorname && !kind.nachname) continue;
    let vorhanden = kindFinden(projekt, kind);
    if (!vorhanden) {
      vorhanden = { id: id(projekt, 'k'), ...kind };
      projekt.kinder.push(vorhanden);
      etwasNeu = true;
    } else if (kind.nachname && !vorhanden.nachname) {
      vorhanden.nachname = kind.nachname;   // a later submission filled in the surname
      aenderungen.push(`Nachname ergänzt: ${vorhanden.vorname} ${kind.nachname}`);
    }
    kindIds.push(vorhanden.id);
  }

  const einwilligung = einwilligungAus(s, jetzt);

  for (const rohePerson of s.personen || []) {
    const { person, hinweise: h } = personNormalisieren(rohePerson);
    hinweise.push(...h);
    if (!person.vorname && !person.nachname && !person.email && !person.mobil) continue;

    const schl = personSchluessel(person);
    let vorhanden = projekt.personen.find((p) => personSchluessel(p) === schl);
    if (!vorhanden) {
      vorhanden = { id: id(projekt, 'p'), ...person, kinder: [], einwilligung };
      projekt.personen.push(vorhanden);
      etwasNeu = true;
    } else {
      const diff = feldweiseUebernehmen(vorhanden, person);
      aenderungen.push(...diff);
      // An explicit answer always wins, including over an earlier one: this is how a
      // withdrawal takes effect.
      if (s.einwilligung) {
        if (vorhanden.einwilligung.liste !== einwilligung.liste
            || vorhanden.einwilligung.whatsapp !== einwilligung.whatsapp) {
          aenderungen.push(
            `Einwilligung: Liste ${vorhanden.einwilligung.liste} → ${einwilligung.liste}, ` +
            `WhatsApp ${vorhanden.einwilligung.whatsapp} → ${einwilligung.whatsapp}`);
        }
        vorhanden.einwilligung = einwilligung;
      }
    }
    for (const kid of kindIds) if (!vorhanden.kinder.includes(kid)) vorhanden.kinder.push(kid);
  }

  const ergebnis = etwasNeu ? 'neu' : (aenderungen.length ? 'ergaenzt' : 'unveraendert');
  projekt.protokoll.push({
    zeit: jetzt,
    art: 'einreichung',
    text: `${ergebnis}: ${(s.kinder || []).map((k) => k.vorname).join(', ') || 'ohne Kind'}`,
  });
  return { ergebnis, kinder: kindIds, hinweise, aenderungen };
}

// ---------------------------------------------------------------- queries

export const personenFuerKind = (projekt, kindId) =>
  projekt.personen.filter((p) => p.kinder.includes(kindId));

/** Only people who said yes belong in anything shared with other parents. */
export const fuerKlassenliste = (projekt) =>
  projekt.personen.filter((p) => p.einwilligung.liste === true);

export const fuerWhatsapp = (projekt) =>
  projekt.personen.filter((p) => p.einwilligung.whatsapp === true && p.mobil);

/** People whose consent was never recorded. They stay out of shared output until asked. */
export const einwilligungOffen = (projekt) =>
  projekt.personen.filter((p) => p.einwilligung.liste === UNBEKANNT);

/**
 * Roster reconciliation: which children on the class list have nobody attached yet.
 * @param {string[]} roster names as written on the class list
 */
export function fehlendeKinder(projekt, roster) {
  const vorhanden = new Set(projekt.kinder
    .filter((k) => personenFuerKind(projekt, k.id).length > 0)
    .map((k) => kindSchluessel(k)));
  return (roster || []).filter((name) => {
    const teile = String(name).trim().split(/\s+/);
    const kind = { vorname: teile[0] || '', nachname: teile.slice(1).join(' ') };
    if (vorhanden.has(kindSchluessel(kind))) return false;
    // A roster entry with only a first name still matches a child recorded with a surname.
    if (!kind.nachname) {
      return ![...vorhanden].some((s) => s.startsWith(`${schluessel(kind.vorname)}|`));
    }
    return true;
  });
}

// ---------------------------------------------------------------- persistence

export const projektNachJson = (projekt) => JSON.stringify(projekt, null, 1);

export function projektAusJson(text) {
  let p;
  try { p = JSON.parse(text); } catch { return { ok: false, reason: 'keine gültige Datei' }; }
  if (!p || typeof p !== 'object') return { ok: false, reason: 'keine gültige Datei' };
  if (p.v !== PROJEKT_VERSION) return { ok: false, reason: `unbekannte Dateiversion ${p.v}` };
  for (const feld of ['kinder', 'personen', 'protokoll']) {
    if (!Array.isArray(p[feld])) return { ok: false, reason: `Feld ${feld} fehlt` };
  }
  return { ok: true, projekt: p };
}

export function personLoeschen(projekt, personId, jetzt = '') {
  const i = projekt.personen.findIndex((p) => p.id === personId);
  if (i === -1) return false;
  const [weg] = projekt.personen.splice(i, 1);
  projekt.protokoll.push({ zeit: jetzt, art: 'loeschung', text: `${weg.vorname} ${weg.nachname}` });
  // Children nobody is attached to any more go too: keeping them would leave a name in the
  // file with no purpose, and the point of the year-end routine is that nothing lingers.
  projekt.kinder = projekt.kinder.filter((k) => personenFuerKind(projekt, k.id).length > 0);
  return true;
}
