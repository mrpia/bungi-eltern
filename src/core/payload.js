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
// The wire keys are the same English names the rest of the code uses, so there is no
// translation table between the API and the format. An earlier version shortened them to
// single letters; measured on a two-caregiver family that saved 253 characters of a link
// that is 594 characters either way, sitting under a multi-line readable block. It bought
// nothing and cost a mapping layer where the two vocabularies could drift apart.
//
// Deliberately not compressed. CompressionStream('deflate-raw') would make this smaller
// than the single-letter version was, but it needs iOS 16.4 or newer, and a parent on an
// older phone would get a form that quietly fails. Compatibility beats tidier links.

export const PAYLOAD_VERSION = 1;

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

const str = (v) => (v === undefined || v === null ? '' : String(v));

/**
 * @param {object} s submission:
 *   { classLabel, schoolYear, noticeVersion, date,
 *     children: [{firstName, lastName}],
 *     caregivers: [{firstName, lastName, role, email, mobile,
 *                   address: {street, postcode, town}}],
 *     consent: {classList, whatsappGroup} }
 */
export function encodeSubmission(s) {
  // Empty fields are dropped rather than written as "": absent and blank mean the same
  // thing here, and the shorter link is free.
  const keep = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

  const wire = {
    version: PAYLOAD_VERSION,
    ...keep({
      classLabel: str(s.classLabel),
      schoolYear: str(s.schoolYear),
      noticeVersion: str(s.noticeVersion),
      date: str(s.date),
    }),
    children: (s.children || []).map((c) => keep({
      firstName: str(c.firstName), lastName: str(c.lastName),
    })),
    caregivers: (s.caregivers || []).map((c) => {
      const out = keep({
        firstName: str(c.firstName), lastName: str(c.lastName), role: str(c.role),
        email: str(c.email), mobile: str(c.mobile),
      });
      const a = c.address || {};
      const address = keep({ street: str(a.street), postcode: str(a.postcode), town: str(a.town) });
      if (Object.keys(address).length) out.address = address;
      return out;
    }),
    consent: {
      classList: !!s.consent?.classList,
      whatsappGroup: !!s.consent?.whatsappGroup,
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
  if (!wire || typeof wire !== 'object' || Array.isArray(wire)) {
    return fail('unreadable', 'Der Link ist unvollständig oder beschädigt.');
  }
  if (wire.version !== PAYLOAD_VERSION) {
    return fail('version-mismatch',
      `Dieser Link stammt aus einer anderen Version (${wire.version}) des Formulars.`);
  }
  if (!Array.isArray(wire.caregivers) || wire.caregivers.length === 0) {
    return fail('no-caregiver', 'Im Link ist keine Bezugsperson angegeben.');
  }

  return {
    ok: true,
    submission: {
      classLabel: str(wire.classLabel),
      schoolYear: str(wire.schoolYear),
      noticeVersion: str(wire.noticeVersion),
      date: str(wire.date),
      children: (Array.isArray(wire.children) ? wire.children : []).map((c) => ({
        firstName: str(c?.firstName), lastName: str(c?.lastName),
      })),
      caregivers: wire.caregivers.map((c) => ({
        firstName: str(c?.firstName), lastName: str(c?.lastName), role: str(c?.role),
        email: str(c?.email), mobile: str(c?.mobile),
        address: c?.address
          ? { street: str(c.address.street), postcode: str(c.address.postcode), town: str(c.address.town) }
          : null,
      })),
      consent: {
        classList: !!wire.consent?.classList,
        whatsappGroup: !!wire.consent?.whatsappGroup,
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
