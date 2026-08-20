// Phone normalisation for a Swiss primary school class list.
//
// Deliberately not libphonenumber: that library is ~150 KB and this tool must stay
// readable in a single inlined file. The country set below is what actually turns up in
// a Swiss class: Switzerland, Liechtenstein, and the four neighbours, because
// cross-border families are normal here.

const DEFAULT_CC = '41';

const COUNTRIES = {
  '41':  { iso: 'CH', minNsn: 9,  maxNsn: 9 },
  '423': { iso: 'LI', minNsn: 7,  maxNsn: 7 },
  '49':  { iso: 'DE', minNsn: 6,  maxNsn: 11 },
  '33':  { iso: 'FR', minNsn: 9,  maxNsn: 9 },
  '39':  { iso: 'IT', minNsn: 6,  maxNsn: 11 },
  '43':  { iso: 'AT', minNsn: 7,  maxNsn: 13 },
};

// Longest prefix first, so 423 wins over 42-something.
const CC_BY_LENGTH = Object.keys(COUNTRIES).sort((a, b) => b.length - a.length);

/** Separators people actually use when they cram two numbers into one field. */
const MULTI_SPLIT = /\s*(?:\/|;|\bod(?:er)?\.?\b|\bund\b|\bor\b|,)\s*/i;

function clean(raw) {
  return String(raw)
    // "+41 (0)79 ..." is extremely common on Swiss letterheads. The (0) is a national
    // trunk hint that must vanish, not become a digit.
    .replace(/\((\s*0\s*)\)/g, '')
    .replace(/[  -​]/g, ' ')     // nbsp and friends
    .replace(/[‐-―−]/g, '-')      // unicode dashes
    .trim();
}

/**
 * Normalise one phone number.
 * @returns {{ok: boolean, e164?: string, display?: string, iso?: string,
 *            type?: 'mobile'|'landline'|'service'|'unknown', reason?: string,
 *            warnings: string[]}}
 */
export function normalizePhone(raw) {
  const warnings = [];
  if (raw === null || raw === undefined) return { ok: false, reason: 'empty', warnings };

  const text = clean(raw);
  if (!text) return { ok: false, reason: 'empty', warnings };

  const hadPlus = text.startsWith('+');
  const digits = text.replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'no-digits', warnings };

  let intl;
  if (hadPlus) {
    intl = digits;
  } else if (digits.startsWith('00')) {
    intl = digits.slice(2);
  } else if (digits.startsWith('0')) {
    // National form. Drop the trunk zero, prepend the default country.
    intl = DEFAULT_CC + digits.slice(1);
  } else if (digits.length === 9) {
    // "79 123 45 67" — the trunk zero got lost somewhere. Common on hand-filled forms.
    intl = DEFAULT_CC + digits;
    warnings.push('assumed-swiss-missing-trunk-zero');
  } else if (digits.length >= 11 && COUNTRIES[digits.slice(0, 2)]) {
    // Someone typed the country code without a plus: "41791234567".
    intl = digits;
    warnings.push('assumed-country-code-without-plus');
  } else {
    return { ok: false, reason: 'ambiguous', warnings };
  }

  const cc = CC_BY_LENGTH.find((c) => intl.startsWith(c));
  if (!cc) {
    // Unknown country: keep it rather than lose it. A delegate can still dial it.
    warnings.push('unknown-country');
    return {
      ok: true, e164: '+' + intl, display: '+' + intl,
      iso: null, type: 'unknown', warnings,
    };
  }

  const nsn = intl.slice(cc.length);
  const meta = COUNTRIES[cc];
  if (nsn.length < meta.minNsn) return { ok: false, reason: 'too-short', warnings };
  if (nsn.length > meta.maxNsn) return { ok: false, reason: 'too-long', warnings };

  return {
    ok: true,
    e164: '+' + cc + nsn,
    display: formatDisplay(cc, nsn),
    iso: meta.iso,
    type: classify(cc, nsn),
    warnings,
  };
}

// Mobile ranges matter more than they look: a WhatsApp group only works on mobiles, and
// the delegate should not have to guess which of two numbers to use.
const MOBILE_PREFIX = {
  '41':  /^7/,            // CH  074-079
  '423': /^7/,            // LI  7xx
  '49':  /^1[5-7]/,       // DE  015x/016x/017x
  '33':  /^[67]/,         // FR  06/07
  '39':  /^3/,            // IT  3xx
  '43':  /^6[4-9]/,       // AT  064x-069x
};

function classify(cc, nsn) {
  if (cc === '41' && (nsn[0] === '8' || nsn[0] === '9')) return 'service';
  const re = MOBILE_PREFIX[cc];
  if (!re) return 'unknown';
  return re.test(nsn) ? 'mobile' : 'landline';
}

function formatDisplay(cc, nsn) {
  // Swiss numbers are uniformly 2+3+2+2 once the trunk zero is gone, mobile included.
  if (cc === '41' && nsn.length === 9) {
    return `+41 ${nsn.slice(0, 2)} ${nsn.slice(2, 5)} ${nsn.slice(5, 7)} ${nsn.slice(7)}`;
  }
  if (cc === '423' && nsn.length === 7) {
    return `+423 ${nsn.slice(0, 3)} ${nsn.slice(3, 5)} ${nsn.slice(5)}`;
  }
  // Other countries: no pretty grouping invented, because a wrong grouping reads as a
  // wrong number. Kept as one block.
  return `+${cc} ${nsn}`;
}

/**
 * A single form field sometimes holds two numbers ("079 ... / 044 ...").
 * Returns one result per candidate, in the order given.
 */
export function normalizePhoneField(raw) {
  if (raw === null || raw === undefined) return [];
  const parts = clean(raw).split(MULTI_SPLIT).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return [];
  return parts.map(normalizePhone);
}
