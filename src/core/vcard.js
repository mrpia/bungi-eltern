// vCard 3.0 output.
//
// 3.0 rather than 4.0 on purpose: import fidelity across iOS Contacts, Google Contacts
// and Outlook is measurably better, and none of 4.0's additions matter for a class list.
//
// Naming convention, decided once for all classes because per-class variation is exactly
// the inconsistency this tool exists to remove:
//
//   N     Müller;Sophie            structured, so the phone sorts by surname
//   FN    Sophie Müller (Léa)      natural reading order, short enough to survive
//                                  truncation in a WhatsApp header
//   ORG   Klasse 3a                iOS and Android render this under the name, which
//                                  puts the class on screen without spending characters
//                                  in FN
//   CATEGORIES  Klasse 3a 2026/27  grouping and, three years later, cleanup
//   UID   stable                   the only thing that gives an importer a chance to
//                                  update instead of duplicating on the yearly refresh

const CRLF = '\r\n';

/** vCard escaping: backslash first, then the separators, then newlines. */
function esc(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold to 75 octets per line with a leading space on continuations, per RFC 2426.
 * Counted in UTF-8 bytes, not characters: "Müller" is 7 bytes, and a fold placed by
 * character count can split a multi-byte sequence and corrupt the name.
 */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never cut inside a UTF-8 continuation sequence (0b10xxxxxx).
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(new TextDecoder().decode(bytes.slice(start, end)));
    start = end;
    limit = 74; // continuation lines lose one octet to the leading space
  }
  return out.join(CRLF + ' ');
}

/** Small deterministic hash. Not cryptographic — it only needs to be stable. */
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Stable UID for a caregiver. Built from the class train and the caregiver's most
 * durable identifier, so regenerating next year yields the same UID and a client that
 * honours UID can update rather than duplicate.
 */
export function caregiverUid(caregiver, trainId) {
  const anchor = (caregiver.email || caregiver.mobile?.e164 || '')
    .toLowerCase()
    || `${caregiver.lastName}|${caregiver.firstName}`.toLowerCase();
  return `kk-${fnv1a(`${trainId}|${anchor}`)}`;
}

function childSuffix(children) {
  const names = (children || []).map((c) => c.firstName).filter(Boolean);
  if (names.length === 0) return '';
  // Joined with " & " rather than a comma list: a comma in a vCard text value has to be
  // escaped as "\," and any client that neglects to unescape it shows a backslash in the
  // contact name. Siblings in the same class are twins or a mixed-age kindergarten
  // group, so the list is short enough that "&" reads fine.
  return ` (${names.join(' & ')})`;
}

/**
 * @param {object} entry  { caregiver, children, household, trainId }
 * @param {object} ctx    { classLabel, schoolYear, consentDate }
 * @returns {string} one vCard, CRLF-terminated
 */
export function caregiverToVCard(entry, ctx) {
  const { caregiver: c, children, household, trainId } = entry;
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];

  lines.push(`UID:${caregiverUid(c, trainId)}`);
  lines.push(`N:${esc(c.lastName)};${esc(c.firstName)};;;`);
  lines.push(`FN:${esc(`${c.firstName} ${c.lastName}`.trim() + childSuffix(children))}`);

  if (ctx.classLabel) lines.push(`ORG:${esc(ctx.classLabel)}`);

  for (const phone of c.phones || []) {
    if (!phone?.ok) continue;
    const type = phone.type === 'mobile' ? 'CELL,VOICE' : 'HOME,VOICE';
    lines.push(`TEL;TYPE=${type}:${esc(phone.display)}`);
  }
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET,PREF:${esc(c.email)}`);

  if (household && (household.street || household.town)) {
    // vCard 3.0 ADR: pobox;extended;street;locality;region;postal-code;country
    lines.push(
      `ADR;TYPE=HOME:;;${esc(household.street)};${esc(household.town)};;` +
      `${esc(household.postcode)};${esc(household.country || 'Schweiz')}`,
    );
  }

  if (ctx.classLabel) {
    const cat = ctx.schoolYear ? `${ctx.classLabel} ${ctx.schoolYear}` : ctx.classLabel;
    lines.push(`CATEGORIES:${esc(cat)}`);
  }
  if (ctx.consentDate) {
    lines.push(`NOTE:${esc(`Elternkontakt ${ctx.classLabel ?? ''}`.trim() +
      `. Freigabe der Eltern vom ${ctx.consentDate}.`)}`);
  }
  if (ctx.revision) lines.push(`REV:${esc(ctx.revision)}`);

  lines.push('END:VCARD');
  return lines.map(fold).join(CRLF) + CRLF;
}

/** Concatenate into one .vcf file. Callers must have applied the consent filter already. */
export function vcardFile(entries, ctx) {
  return entries.map((e) => caregiverToVCard(e, ctx)).join('');
}
