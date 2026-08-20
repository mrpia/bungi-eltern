// The submission payload: what travels from a parent's phone to a delegate.
//
// Two representations of the same data, both produced at once:
//
//   readable  a German block the parent can see before sending. This is part of the
//             consent: nobody should send a family's contact details as opaque gibberish.
//   compact   base64url JSON, carried in a URL *fragment*. Fragments are never sent to
//             the server by the browser, so the data stays client-side even though it
//             travelled as a link.
//
// Keys are short because the whole thing has to survive as a tappable link in a WhatsApp
// message. Verbosity here costs URL length, and URL length is the one hard budget.

export const PAYLOAD_VERSION = 1;

/** Long field names, for reading the code. Short ones, for the wire. */
const K = {
  version: 'v', klasse: 'k', schuljahr: 'j', merkblatt: 'n', datum: 't',
  kinder: 'kd', personen: 'bp', einwilligung: 'c',
  vorname: 'v', nachname: 'n', rolle: 'r', email: 'e', mobil: 'm', adresse: 'a',
  strasse: 's', plz: 'p', ort: 'o',
  liste: 'l', whatsapp: 'w',
};

function b64urlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * @param {object} s submission in long-key form:
 *   { klasse, schuljahr, merkblatt, datum, kinder: [{vorname, nachname}],
 *     personen: [{vorname, nachname, rolle, email, mobil, adresse:{strasse,plz,ort}}],
 *     einwilligung: {liste, whatsapp} }
 */
export function encodeSubmission(s) {
  const person = (p) => {
    const o = { [K.vorname]: p.vorname || '', [K.nachname]: p.nachname || '' };
    if (p.rolle) o[K.rolle] = p.rolle;
    if (p.email) o[K.email] = p.email;
    if (p.mobil) o[K.mobil] = p.mobil;
    const a = p.adresse || {};
    if (a.strasse || a.plz || a.ort) {
      o[K.adresse] = {
        ...(a.strasse ? { [K.strasse]: a.strasse } : {}),
        ...(a.plz ? { [K.plz]: a.plz } : {}),
        ...(a.ort ? { [K.ort]: a.ort } : {}),
      };
    }
    return o;
  };

  const wire = {
    [K.version]: PAYLOAD_VERSION,
    [K.klasse]: s.klasse,
    [K.schuljahr]: s.schuljahr,
    [K.merkblatt]: s.merkblatt,
    [K.datum]: s.datum,
    [K.kinder]: (s.kinder || []).map((k) => ({
      [K.vorname]: k.vorname || '', [K.nachname]: k.nachname || '',
    })),
    [K.personen]: (s.personen || []).map(person),
    [K.einwilligung]: {
      [K.liste]: !!s.einwilligung?.liste,
      [K.whatsapp]: !!s.einwilligung?.whatsapp,
    },
  };
  return b64urlEncode(JSON.stringify(wire));
}

/**
 * @returns {{ok: true, submission: object} | {ok: false, reason: string}}
 *   Never throws: this parses data that arrived through WhatsApp, where messages get
 *   truncated, autocorrected and forwarded with extra characters attached.
 */
export function decodeSubmission(encoded) {
  if (!encoded || typeof encoded !== 'string') return { ok: false, reason: 'leer' };
  let wire;
  try {
    wire = JSON.parse(b64urlDecode(encoded.trim()));
  } catch {
    return { ok: false, reason: 'unlesbar' };
  }
  if (!wire || typeof wire !== 'object') return { ok: false, reason: 'unlesbar' };
  if (wire[K.version] !== PAYLOAD_VERSION) {
    return { ok: false, reason: `unbekannte Version ${wire[K.version]}` };
  }
  if (!Array.isArray(wire[K.personen]) || wire[K.personen].length === 0) {
    return { ok: false, reason: 'keine Bezugsperson' };
  }

  const adresse = (a) => (a ? {
    strasse: a[K.strasse] || '', plz: a[K.plz] || '', ort: a[K.ort] || '',
  } : null);

  return {
    ok: true,
    submission: {
      klasse: wire[K.klasse] || '',
      schuljahr: wire[K.schuljahr] || '',
      merkblatt: wire[K.merkblatt] || '',
      datum: wire[K.datum] || '',
      kinder: (wire[K.kinder] || []).map((k) => ({
        vorname: k[K.vorname] || '', nachname: k[K.nachname] || '',
      })),
      personen: wire[K.personen].map((p) => ({
        vorname: p[K.vorname] || '', nachname: p[K.nachname] || '',
        rolle: p[K.rolle] || '', email: p[K.email] || '', mobil: p[K.mobil] || '',
        adresse: adresse(p[K.adresse]),
      })),
      einwilligung: {
        liste: !!wire[K.einwilligung]?.[K.liste],
        whatsapp: !!wire[K.einwilligung]?.[K.whatsapp],
      },
    },
  };
}

/**
 * The block the parent reads before sending, and the fallback a delegate can retype if a
 * link ever breaks. Deliberately plain text: WhatsApp keeps newlines but mangles anything
 * cleverer.
 */
export function readableSummary(s) {
  const lines = [`Kontaktangaben ${s.klasse} · ${s.schuljahr}`];
  for (const k of s.kinder || []) {
    const name = `${k.vorname} ${k.nachname}`.trim();
    if (name) lines.push(`Kind: ${name}`);
  }
  for (const p of s.personen || []) {
    const teile = [`${p.vorname} ${p.nachname}`.trim()];
    if (p.rolle) teile.push(p.rolle);
    if (p.email) teile.push(p.email);
    if (p.mobil) teile.push(p.mobil);
    lines.push(teile.filter(Boolean).join(' · '));
    if (p.adresse && (p.adresse.strasse || p.adresse.ort)) {
      lines.push(`  ${[p.adresse.strasse, [p.adresse.plz, p.adresse.ort].filter(Boolean).join(' ')]
        .filter(Boolean).join(', ')}`);
    }
  }
  lines.push(`Klassenliste: ${s.einwilligung?.liste ? 'ja' : 'nein'}`);
  lines.push(`WhatsApp-Gruppe: ${s.einwilligung?.whatsapp ? 'ja' : 'nein'}`);
  return lines.join('\n');
}

/**
 * The complete message: readable block, then the link the delegate taps.
 * @param {string} basis e.g. https://bungi-eltern.mrpia.ch
 */
export function submissionMessage(s, basis) {
  const link = `${String(basis).replace(/\/$/, '')}/w/#d=${encodeSubmission(s)}`;
  return {
    text: `${readableSummary(s)}\n\nFür die Delegierten zum Übernehmen:\n${link}`,
    link,
  };
}
