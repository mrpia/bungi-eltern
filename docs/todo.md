# What is left to build

One page, ordered by what unblocks the most. Written so a spare hour can be spent without
first reconstructing context. Each item says what "done" means.

Date that governs everything: the first class parents' evening (Elternabend) is
**2026-09-03**. Nothing has been printed and no class is using the tool, so that date is a
decision point rather than a deadline — what to actually use gets chosen a few weeks
beforehand. Worst case is no rollout this school year and a sound basis for the next one,
which is why none of the below is worth rushing into a shape that has to be undone.

## Done and deployed

- Core library: phone normalisation, name capitalisation, email cleanup with typo
  suggestions, class names, school years and class trains, vCard 3.0, QR as SVG with a
  print-size guard, submission payload, data model with the merge rules. 67 tests.
- Three printable sheets, each measured to fit one A4: family sheet, teacher sheet,
  information notice (Merkblatt).
- Parent form at `/f/<class>/` for all 13 classes, German with an English toggle.
- Hosting: `mrpia/bungi-eltern` on GitHub Pages, live at
  <https://bungi-eltern.mrpia.ch> over HTTPS, deploy gated on `npm test`.
- Workbench `/w/`: deep-link intake with a confirmation step, IndexedDB with autosave,
  the list grouped by child, three-state consent toggling, paper-form entry, project file
  save and load, delete. All ten acceptance checks in [`workbench.md`](workbench.md) walked
  in a real browser. 98 tests.

---

## 0 — Take the "Testbetrieb" banner down

Every published page currently carries a work-in-progress notice, because the site is live
and being tried out before anyone has agreed to use it. It is one edit to remove: set
`wipNotice` to `""` in `site.config.json` and rebuild. The `.wip` rules at the bottom of
`src/f/form.css` and `src/w/workbench.css` go at the same time.

Listed as item 0 because a temporary banner with nobody assigned to remove it is a
permanent banner.

**Done when:** the notice is gone from all 20 published pages, and going live is a decision
somebody actually made.

## 1 — The six outputs

Needed within a week or two *after* the parents' evening, not before it, because data has to
exist first.

1. Printable A4 class list, consent-filtered, dated and version-stamped
2. Contact cards: multi-vCard, Google Contacts CSV (comma), Excel list (semicolon + BOM)
3. BCC address string and a pre-addressed mail launcher, with a hard warning against To/CC
4. Chase list: which roster children have nobody attached, plus a ready reminder text
5. WhatsApp onboarding: invite-link message, not adding people by number
6. Year-end: final export, then delete, with a dated record

`src/core/vcard.js` already renders cards; only the consent filter and the file assembly are
missing. `forClassList()` and `missingChildren()` in `model.js` supply items 1 and 4.

**Done when:** a class list, a `.vcf` and both CSVs come out of a project with one click
each, and nothing without recorded consent appears in any of them.

## 2 — Delegate self-setup `/start/`

The QR code on the teacher's sheet points here. A newly elected delegate opens it on a phone
and gets back their class form link plus a ready-to-paste announcement.

**Sixty seconds, no account.** Inputs: class (from the list in `site.config.json`), own name,
own email or mobile. Outputs: the link `/f/<slug>/?d=<contact>`, a QR of it, and a short
German message they can paste into Escola or a chat.

**Done when:** a phone-only run produces a working link that prefills the recipient in the
parent form.

## 3 — Confirm the class list

`site.config.json` currently lists a **guess**: KiGa 1–3, Klasse 1a/1b, 2a/2b, 3a/3b, 4a/4b,
5, 6. Which years actually split a/b changes annually.

**Done when:** the 13 entries match reality. A name the parser cannot read fails the build
rather than producing a wrong slug, so a mistake here is loud rather than silent.

## 4 — Batch generator for the print run

Nice-to-have, not a blocker: `/kit/` already offers per-class links, so printing means
opening 13 pages and typing "22" into the print dialog.

**Done when:** one run produces 13 teacher sheets plus 13 labelled family-sheet stacks.

## 5 — Single-file offline build

An inliner (~50 lines of Node) folding everything into one `dist/klassenkontakte.html`,
because `file://` blocks ES module imports. For delegates who want a local copy.

**Watch out:** `file://` has a different origin and therefore different IndexedDB storage
than the hosted page. See the trap section in [`docs/workbench.md`](workbench.md).

## 6 — Verify contact cards on real devices

An unverified assumption: that vCard 3.0 `CATEGORIES` survives import into iOS Contacts,
Google Contacts and Outlook as a usable group, and that a stable `UID` makes a re-import
update rather than duplicate.

**Done when:** all three have been tried on real devices and the export adjusted to whatever
actually holds.

## 7 — QR scanning in the workbench

Deliberately last. It existed to solve in-room capture by a delegate's laptop, but delegates
are elected at the parents' evening and have only phones, so there is no in-room capture.
Keep only as a later convenience for a delegate sitting at a computer.

---

## Waiting on other people

- **Escola request to the school director.** In review with the two other Vorstand delegates
  as of 2026-08-20; sent to the director once they approve. A yes to the group selector
  (Gruppenwähler) means the delegates can message their whole class without holding any
  contact data, which shrinks the dataset to opt-in families only. A yes to the fourth
  question — whether the city's «Meine Kinder» service or Escola will cover this anyway —
  could make most of this tool unnecessary. Worth knowing before item 1 gets built — the
workbench survives either answer, the output *formats* are what a yes would change.
*(The HTTPS certificate landed on 2026-08-20 and enforcement is on. See the ordering trap
in [`docs/hosting.md`](hosting.md) if a second subdomain is ever set up.)*

## Ground rules worth not rediscovering

- **English for developers, German for parents and delegates.** See the README.
- **Asset URLs carry a content hash.** HTML and JS cache separately, so without it a
  delegate can run a stale script against a fresh page. Any new asset the build emits needs
  the same treatment.
- **No `connect-src` in any CSP.** It is the one load-bearing promise: the pages cannot send
  a class's data anywhere. Loading a library or an icon from a CDN breaks it.
- **Normalise on the way in, never in a renderer.** `ingestSubmission()` does it, so no
  output has to wonder whether a value is clean.
- **Consent absent is "unknown", never "no".** Old lists and WhatsApp groups arrive without
  consent, stay out of everything shared, and get flagged for asking.
- **A visible duplicate beats a silent mix-up.** Where a match is ambiguous, create a second
  entry and let the delegate see it.
- `npm test` gates every deploy. That is deliberate: `test/qr.test.js` keeps the printed QR
  codes scannable, so a change that would ruin a print run fails in CI instead.
- **`npm test` passing is not evidence that a page works.** Four bugs found on 2026-08-20
  were all invisible to it: the build's `<meta>` substitution had silently stopped matching
  after the German→English rename, so twelve of thirteen live form pages announced
  "Klasse 3a"; two CSS selectors still carried their German names; and `.hidden` lost a
  specificity tie to `.button`. Every one needed either the built output or a browser.
- **Prefer the primitive that fails loudly.** `String.replace` treats a missing needle as
  success, which is what let the `<meta>` bug ship. `tools/build.mjs` now throws instead,
  and `site/` is gitignored, so a build-time throw is the only place such a thing can be
  caught before it is live.
