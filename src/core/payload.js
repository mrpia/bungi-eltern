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
// The wire keys are single letters because the whole thing has to survive as a tappable
// link in a WhatsApp message. Verbosity there costs URL length, and URL length is the one
// hard budget. Those letters are the actual on-the-wire format: changing one breaks every
// link already sent, so they are deliberately language-neutral and stay as they are.

export const PAYLOAD_VERSION = 1;

/** English names for reading the code, single letters for the wire. */
const K = {
  version: 'v', classLabel: 'k', schoolYear: 'j', noticeVersion: 'n', date: 't',
  children: 'kd', caregivers: 'bp', consent: 'c',
  firstName: 'v', lastName: 'n', role: 'r', email: 'e', mobile: 'm', address: 'a',
  street: 's', postcode: 'p', town: 'o',
  classList: 'l', whatsappGroup: 'w',
};

function b64urlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * @param {object} s submission in long-name form:
 *   { classLabel, schoolYear, noticeVersion, date,
 *     children: [{firstName, lastName}],
 *     caregivers: [{firstName, lastName, role, email, mobile,
 *                   address: {street, postcode, town}}],
 *     consent: {classList, whatsappGroup} }
 */
export function encodeSubmission(s) {
  const caregiver = (c) => {
    const o = { [K.firstName]: c.firstName || '', [K.lastName]: c.lastName || '' };
    if (c.role) o[K.role] = c.role;
    if (c.email) o[K.email] = c.email;
    if (c.mobile) o[K.mobile] = c.mobile;
    const a = c.address || {};
    if (a.street || a.postcode || a.town) {
      o[K.address] = {
        ...(a.street ? { [K.street]: a.street } : {}),
        ...(a.postcode ? { [K.postcode]: a.postcode } : {}),
        ...(a.town ? { [K.town]: a.town } : {}),
      };
    }
    return o;
  };

  const wire = {
    [K.version]: PAYLOAD_VERSION,
    [K.classLabel]: s.classLabel,
    [K.schoolYear]: s.schoolYear,
    [K.noticeVersion]: s.noticeVersion,
    [K.date]: s.date,
    [K.children]: (s.children || []).map((c) => ({
      [K.firstName]: c.firstName || '', [K.lastName]: c.lastName || '',
    })),
    [K.caregivers]: (s.caregivers || []).map(caregiver),
    [K.consent]: {
      [K.classList]: !!s.consent?.classList,
      [K.whatsappGroup]: !!s.consent?.whatsappGroup,
    },
  };
  return b64urlEncode(JSON.stringify(wire));
}

/**
 * @returns {{ok: true, submission: object} | {ok: false, code: string, text: string}}
 *   Never throws: this parses data that arrived through WhatsApp, where messages get
 *   truncated, autocorrected and forwarded with extra characters attached. `code` is for
 *   branching, `text` is the German sentence a delegate reads.
 */
export function decodeSubmission(encoded) {
  const fail = (code, text) => ({ ok: false, code, text });

  if (!encoded || typeof encoded !== 'string') {
    return fail('empty', 'Der Link enthält keine Angaben.');
  }
  let wire;
  try {
    wire = JSON.parse(b64urlDecode(encoded.trim()));
  } catch {
    return fail('unreadable', 'Der Link ist unvollständig oder beschädigt.');
  }
  if (!wire || typeof wire !== 'object') {
    return fail('unreadable', 'Der Link ist unvollständig oder beschädigt.');
  }
  if (wire[K.version] !== PAYLOAD_VERSION) {
    return fail('version-mismatch',
      `Dieser Link stammt aus einer anderen Version (${wire[K.version]}) des Formulars.`);
  }
  if (!Array.isArray(wire[K.caregivers]) || wire[K.caregivers].length === 0) {
    return fail('no-caregiver', 'Im Link ist keine Bezugsperson angegeben.');
  }

  const address = (a) => (a ? {
    street: a[K.street] || '', postcode: a[K.postcode] || '', town: a[K.town] || '',
  } : null);

  return {
    ok: true,
    submission: {
      classLabel: wire[K.classLabel] || '',
      schoolYear: wire[K.schoolYear] || '',
      noticeVersion: wire[K.noticeVersion] || '',
      date: wire[K.date] || '',
      children: (wire[K.children] || []).map((c) => ({
        firstName: c[K.firstName] || '', lastName: c[K.lastName] || '',
      })),
      caregivers: wire[K.caregivers].map((c) => ({
        firstName: c[K.firstName] || '', lastName: c[K.lastName] || '',
        role: c[K.role] || '', email: c[K.email] || '', mobile: c[K.mobile] || '',
        address: address(c[K.address]),
      })),
      consent: {
        classList: !!wire[K.consent]?.[K.classList],
        whatsappGroup: !!wire[K.consent]?.[K.whatsappGroup],
      },
    },
  };
}

/**
 * The block the parent reads before sending, and the fallback a delegate can retype if a
 * link ever breaks. German, because a parent reads it. Deliberately plain text: WhatsApp
 * keeps newlines but mangles anything cleverer.
 */
export function readableSummary(s) {
  const lines = [`Kontaktangaben ${s.classLabel} · ${s.schoolYear}`];
  for (const child of s.children || []) {
    const name = `${child.firstName} ${child.lastName}`.trim();
    if (name) lines.push(`Kind: ${name}`);
  }
  for (const c of s.caregivers || []) {
    const parts = [`${c.firstName} ${c.lastName}`.trim()];
    if (c.role) parts.push(c.role);
    if (c.email) parts.push(c.email);
    if (c.mobile) parts.push(c.mobile);
    lines.push(parts.filter(Boolean).join(' · '));
    if (c.address && (c.address.street || c.address.town)) {
      lines.push(`  ${[c.address.street,
        [c.address.postcode, c.address.town].filter(Boolean).join(' ')]
        .filter(Boolean).join(', ')}`);
    }
  }
  lines.push(`Klassenliste: ${s.consent?.classList ? 'ja' : 'nein'}`);
  lines.push(`WhatsApp-Gruppe: ${s.consent?.whatsappGroup ? 'ja' : 'nein'}`);
  return lines.join('\n');
}

/**
 * The complete message: readable block, then the link the delegate taps.
 * @param {string} baseUrl e.g. https://bungi-eltern.mrpia.ch
 */
export function submissionMessage(s, baseUrl) {
  const link = `${String(baseUrl).replace(/\/$/, '')}/w/#d=${encodeSubmission(s)}`;
  return {
    text: `${readableSummary(s)}\n\nFür die Delegierten zum Übernehmen:\n${link}`,
    link,
  };
}
