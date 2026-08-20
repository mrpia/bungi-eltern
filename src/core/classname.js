// Class names at this school come in three shapes:
//   "KiGa 1", "KiGa 2"        kindergarten, no sections
//   "Klasse 4"                no a/b split that year
//   "Klasse 3a", "Klasse 3b"  split into sections
//
// Four representations are needed and they are not interchangeable:
//   display  "Klasse 3a"   headings, information notice, printed list
//   short    "3a"          inside a contact card name, where space is scarce
//   slug     "3a"/"kiga1"  URLs and file names, lowercase and punctuation-free
//   sortKey  number        KiGa before Klasse 1, and 3a before 3b

const KIGA = /^(?:kiga|kg|kindergarten)\s*\.?\s*(\d)$/i;
const KLASSE = /^(?:klasse|kl\.?)?\s*(\d)\s*([ab])?$/i;

const SECTION_RANK = { null: 0, a: 1, b: 2 };

/**
 * @param {string} raw anything a delegate or a URL might carry
 * @returns {{ok: boolean, stage?: 'kiga'|'klasse', year?: number,
 *            section?: 'a'|'b'|null, display?: string, short?: string,
 *            slug?: string, sortKey?: number, reason?: string}}
 */
export function parseClassName(raw) {
  if (raw === null || raw === undefined) return { ok: false, reason: 'empty' };
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'empty' };

  const kiga = text.match(KIGA);
  if (kiga) return build('kiga', Number(kiga[1]), null);

  const klasse = text.match(KLASSE);
  if (klasse) {
    const section = klasse[2] ? klasse[2].toLowerCase() : null;
    return build('klasse', Number(klasse[1]), section);
  }

  return { ok: false, reason: 'unrecognised' };
}

function build(stage, year, section) {
  // Primary school here runs KiGa 1-2 and Klasse 1-6. Outside that we still accept the
  // value rather than refuse it, because a school reorganisation should not brick the
  // tool, but a caller can check the range.
  if (year < 1 || year > 9) return { ok: false, reason: 'year-out-of-range' };

  const display = stage === 'kiga' ? `KiGa ${year}` : `Klasse ${year}${section ?? ''}`;
  const short = stage === 'kiga' ? `KiGa ${year}` : `${year}${section ?? ''}`;
  const slug = stage === 'kiga' ? `kiga${year}` : `${year}${section ?? ''}`;
  const sortKey = (stage === 'kiga' ? 0 : 1000) + year * 10 + SECTION_RANK[section];

  return { ok: true, stage, year, section, display, short, slug, sortKey };
}

/** Sort class objects or raw names into the order a school would list them. */
export function compareClasses(a, b) {
  const pa = a && a.ok ? a : parseClassName(a);
  const pb = b && b.ok ? b : parseClassName(b);
  if (!pa.ok || !pb.ok) return 0;
  return pa.sortKey - pb.sortKey;
}

/**
 * Label for a vCard CATEGORIES entry: identifies both the class and the year, so a
 * parent's address book can be cleaned up after the children move on.
 */
export function categoryLabel(parsed, schoolYear) {
  const p = parsed && parsed.ok ? parsed : parseClassName(parsed);
  if (!p.ok) return '';
  return schoolYear ? `${p.display} ${schoolYear}` : p.display;
}

/**
 * The class label of a stable group, `years` school years later.
 *
 * A Klassenzug advances: Klasse 1a + 2 years = Klasse 3a, same children, same teacher.
 *
 * Kindergarten is the open question. If the number in "KiGa 1" identifies a *group*
 * (two parallel mixed-age groups, half the children new each year), the label never
 * advances. If it identifies a *year level*, it does. The flag below makes that explicit
 * rather than guessing, because guessing wrong renames every class in August.
 *
 * @param {object|string} cls
 * @param {number} years
 * @param {{kigaNumberIsYearLevel?: boolean}} [opts]
 */
export function advanceClass(cls, years, opts = {}) {
  const p = cls && cls.ok ? cls : parseClassName(cls);
  if (!p.ok) return p;
  if (years === 0) return p;

  if (p.stage === 'kiga') {
    if (!opts.kigaNumberIsYearLevel) return p;      // group label, stays put
    return build('kiga', p.year + years, null);
  }
  return build('klasse', p.year + years, p.section);
}

/**
 * The years a class train is expected to run before the group is re-formed:
 * Klasse 1-3 together, then Klasse 4-6 together. Used to warn a delegate that the
 * train is ending and a fresh collection will be needed.
 */
export function trainEndYear(cls) {
  const p = cls && cls.ok ? cls : parseClassName(cls);
  if (!p.ok) return null;
  // A kindergarten group has no end: there are two or three parallel groups, membership
  // rolls over by roughly half each year, and the group itself carries on. The "train is
  // ending" warning simply does not apply there — the annual delta always does.
  if (p.stage === 'kiga') return null;
  return p.year <= 3 ? 3 : 6;
}
