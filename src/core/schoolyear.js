// Swiss school years are written "2026/27" and start in August. This module exists
// because the class label of a Klassenzug is a function of the school year, not a fixed
// property: the same group of children and the same teacher are Klasse 1a, then 2a,
// then 3a. Storing the label as identity is what would force a delegate to rebuild
// everything each August.

/** Month (1-12) from which a date counts towards the next school year. */
const CUTOVER_MONTH = 7; // July: the old year has ended, planning is for the new one

/**
 * @param {string} raw "2026/27", "2026/2027", "2026-27", "26/27"
 * @returns {{ok: boolean, startYear?: number, label?: string, reason?: string}}
 */
export function parseSchoolYear(raw) {
  if (raw === null || raw === undefined) return { ok: false, reason: 'empty' };
  const text = String(raw).trim();
  if (!text) return { ok: false, reason: 'empty' };

  const m = text.match(/^(\d{2}|\d{4})\s*[/\-–]\s*(\d{2}|\d{4})$/);
  if (!m) return { ok: false, reason: 'unrecognised' };

  const startYear = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  const endGiven = m[2].length === 2 ? Number(m[2]) : Number(m[2]) % 100;
  if (endGiven !== (startYear + 1) % 100) return { ok: false, reason: 'not-consecutive' };

  return { ok: true, startYear, label: formatSchoolYear(startYear) };
}

/** 2026 -> "2026/27", 2099 -> "2099/00" */
export function formatSchoolYear(startYear) {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * Which school year a given date belongs to. July onwards counts as the coming year,
 * so a delegate setting things up over the summer gets the right label.
 */
export function schoolYearOf(date) {
  const d = date instanceof Date ? date : new Date(date);
  const startYear = d.getMonth() + 1 >= CUTOVER_MONTH ? d.getFullYear() : d.getFullYear() - 1;
  return { ok: true, startYear, label: formatSchoolYear(startYear) };
}

export function advanceSchoolYear(sy, years) {
  const p = sy && sy.ok ? sy : parseSchoolYear(sy);
  if (!p.ok) return p;
  return { ok: true, startYear: p.startYear + years, label: formatSchoolYear(p.startYear + years) };
}

/** How many school years lie between two labels. Negative if b precedes a. */
export function schoolYearDiff(a, b) {
  const pa = a && a.ok ? a : parseSchoolYear(a);
  const pb = b && b.ok ? b : parseSchoolYear(b);
  if (!pa.ok || !pb.ok) return null;
  return pb.startYear - pa.startYear;
}
