// Email cleanup. Pragmatic, not RFC 5322: the goal is to catch the four mistakes that
// actually happen on a paper form, not to accept every address the standard permits.

// The providers that dominate a Swiss school class. bluewin.ch and gmx.ch belong on this
// list for the same reason gmail.com does.
const KNOWN_DOMAINS = [
  'gmail.com', 'bluewin.ch', 'gmx.ch', 'gmx.net', 'hotmail.com', 'hotmail.ch',
  'outlook.com', 'icloud.com', 'me.com', 'sunrise.ch', 'hispeed.ch', 'yahoo.com',
  'yahoo.de', 'protonmail.com', 'proton.me', 'bluemail.ch', 'swissonline.ch',
];

const SHAPE = /^[^\s@,;]+@[^\s@,;.]+(?:\.[^\s@,;.]+)+$/;

// Damerau, not plain Levenshtein: swapping two adjacent letters ("gmial.com") is the
// single most common typing mistake, and plain edit distance scores it as 2.
function isNearDomain(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;

  if (a.length === b.length) {
    const diff = [];
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) diff.push(k);
    if (diff.length === 1) return true;                       // one substitution
    if (diff.length === 2 && diff[1] === diff[0] + 1) {        // adjacent transposition
      return a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
    }
    return false;
  }

  // One insertion or deletion.
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0, j = 0, skipped = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i++; j++; continue; }
    if (skipped) return false;
    skipped = true;
    j++;
  }
  return true;
}

/**
 * @returns {{ok: boolean, value?: string, suggestion?: string, reason?: string}}
 *   `suggestion` is advisory only. Never auto-applied: silently rewriting someone's
 *   address is how a family stops receiving mail without anyone noticing.
 */
export function normalizeEmail(raw) {
  if (raw === null || raw === undefined) return { ok: false, reason: 'empty' };

  let text = String(raw).trim()
    .replace(/^mailto:/i, '')
    .replace(/^<|>$/g, '')
    .replace(/\s+/g, '');
  if (!text) return { ok: false, reason: 'empty' };

  const at = text.lastIndexOf('@');
  if (at < 1) return { ok: false, reason: 'no-at' };

  // Local parts are case-sensitive per spec, so only the domain gets lowercased.
  const local = text.slice(0, at);
  const domain = text.slice(at + 1).toLowerCase().replace(/\.+$/, '');
  const value = `${local}@${domain}`;

  if (!SHAPE.test(value)) return { ok: false, reason: 'malformed', value };

  const typo = KNOWN_DOMAINS.find((d) => d !== domain && isNearDomain(domain, d));
  return typo ? { ok: true, value, suggestion: `${local}@${typo}` } : { ok: true, value };
}
