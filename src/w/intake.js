// Taking a parent's submission into the open project: the decisions, without the browser.
//
// Kept free of the DOM on purpose. Everything here is a judgement — is this the right
// class, what would this change, what is new — and judgements get unit tests. The page in
// workbench.js does the talking to the screen.

import { decodeSubmission } from '../core/payload.js';
import { ingestSubmission } from '../core/model.js';
import { parseClassName } from '../core/classname.js';

export const HASH_PREFIX = '#d=';

/**
 * Pull a submission out of a location hash.
 *
 * @returns {{ok: true, submission: object} | {ok: false, code: string, text: string} | null}
 *   `null` when the hash carries no submission at all, which is the ordinary case: a
 *   delegate opening the workbench to look at what they already have.
 */
export function submissionFromHash(hash) {
  const text = String(hash || '');
  if (!text.startsWith(HASH_PREFIX)) return null;

  let payload = text.slice(HASH_PREFIX.length);
  // base64url needs no escaping, so a percent sign means something re-encoded the link on
  // the way through — some mail clients do this to fragments. Undo it before decoding
  // rather than reporting a broken link the delegate can see is intact.
  if (payload.includes('%')) {
    try { payload = decodeURIComponent(payload); } catch { /* leave it and let decode judge */ }
  }
  return decodeSubmission(payload);
}

/**
 * Do two class labels name the same class?
 *
 * Compared by slug, so "Klasse 3a", "klasse 3a" and "3a" are one class. Labels neither
 * side can parse fall back to plain text, because refusing to compare them would let a
 * submission into the wrong project.
 */
export function sameClass(a, b) {
  const pa = parseClassName(a);
  const pb = parseClassName(b);
  if (!pa.ok || !pb.ok) return String(a || '').trim() === String(b || '').trim();
  return pa.slug === pb.slug;
}

export function slugFor(classLabel) {
  const p = parseClassName(classLabel);
  return p.ok ? p.slug : '';
}

const fullName = (p) => `${p.firstName || ''} ${p.lastName || ''}`.trim();

/**
 * What taking this submission in would do — computed by doing it to a copy.
 *
 * The alternative is a second implementation of the merge rules that predicts the outcome,
 * which would drift from the real one and lie to the delegate at exactly the moment they
 * are trusting it. Running the real function against a clone cannot drift.
 *
 * @returns the `ingestSubmission` result plus the names of what would be added.
 */
export function previewIngest(project, submission, now) {
  const copy = structuredClone(project);
  const result = ingestSubmission(copy, submission, { now });

  const knownChildren = new Set(project.children.map((c) => c.id));
  const knownCaregivers = new Set(project.caregivers.map((c) => c.id));
  return {
    ...result,
    addedChildren: copy.children.filter((c) => !knownChildren.has(c.id)).map(fullName),
    addedCaregivers: copy.caregivers.filter((c) => !knownCaregivers.has(c.id)).map(fullName),
  };
}
