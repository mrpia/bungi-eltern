// Name capitalisation for a class list.
//
// The governing rule, and the reason this is short: only touch names that arrive in a
// single case. "MÜLLER" and "müller" are clearly unformatted. "van der Meer",
// "McTavish" and "DiCaprio" were typed by someone who knows how their own name is
// written, and any clever rule we invent will get one of them wrong. So we leave them.

const PARTICLES = new Set([
  'von', 'vom', 'van', 'de', 'del', 'della', 'di', 'da', 'du', 'des', 'der', 'den',
  'ten', 'ter', 'le', 'la', 'zu',
]);

function capitalizeChunk(chunk) {
  if (!chunk) return chunk;
  return chunk[0].toLocaleUpperCase('de-CH') + chunk.slice(1).toLocaleLowerCase('de-CH');
}

function capitalizeToken(token) {
  // Hyphens and apostrophes both start a new capital: Meier-Bühler, O'Brien, D'Amico.
  let out = token.split('-').map((part) =>
    part.split("'").map(capitalizeChunk).join("'")
  ).join('-');

  // "MCDONALD" -> "McDonald". Not attempted for MAC, because "MACRON" would become
  // "MacRon" and that is worse than leaving it as "Macron".
  if (/^Mc[a-zà-ÿ]{2,}$/.test(out)) {
    out = 'Mc' + out[2].toLocaleUpperCase('de-CH') + out.slice(3);
  }
  return out;
}

function isSingleCase(text) {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (!letters) return false;
  return letters === letters.toLocaleLowerCase('de-CH')
      || letters === letters.toLocaleUpperCase('de-CH');
}

/**
 * @param {string} raw
 * @returns {string} the name, whitespace-collapsed, capitalised only if it was
 *   entirely lower or entirely upper case on the way in.
 */
export function normalizeName(raw) {
  if (raw === null || raw === undefined) return '';
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (!isSingleCase(text)) return text;

  const tokens = text.split(' ');
  return tokens
    .map((token, i) => {
      const lower = token.toLocaleLowerCase('de-CH');
      // A particle stays lowercase unless it opens the name ("De Luca" as a surname on
      // its own line is written that way in Switzerland).
      if (i > 0 && PARTICLES.has(lower)) return lower;
      return capitalizeToken(token);
    })
    .join(' ');
}
