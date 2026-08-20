# What is left to build

One page, ordered by what unblocks the most. Written so a spare hour can be spent without
first reconstructing context. Each item says what "done" means.

Deadline that governs everything: the first class parents' evening (Elternabend) is within
four weeks of 2026-08-20, so roughly mid-September 2026. Printing needs to happen in the
first days of September.

## Done and deployed

- Core library: phone normalisation, name capitalisation, email cleanup with typo
  suggestions, class names, school years and class trains, vCard 3.0, QR as SVG with a
  print-size guard, submission payload, data model with the merge rules. 67 tests.
- Three printable sheets, each measured to fit one A4: family sheet, teacher sheet,
  information notice (Merkblatt).
- Parent form at `/f/<class>/` for all 13 classes, German with an English toggle.
- Hosting: `mrpia/bungi-eltern` on GitHub Pages, live at `bungi-eltern.mrpia.ch`, deploy
  gated on `npm test`.

---

## 1 — Workbench `/w/` · the critical one

Without it, a tapped submission link lands on a placeholder and the whole digital route is
dead. Everything else on this list is smaller.

**Spec:** [`docs/workbench.md`](workbench.md). Written to be built cold, with ten acceptance
checks at the end.

**Done when:** all ten acceptance checks pass by hand.

**Start with:** IndexedDB storage plus the deep-link intake. Checks 1 to 7 all hang off
those two.

## 2 — The six outputs

Needed within a week or two *after* the parents' evening, not before it, because data has to
exist first.

1. Printable A4 class list, consent-filtered, dated and version-stamped
2. Contact cards: multi-vCard, Google Contacts CSV (comma), Excel list (semicolon + BOM)
3. BCC address string and a pre-addressed mail launcher, with a hard warning against To/CC
4. Chase list: which roster children have nobody attached, plus a ready reminder text
5. WhatsApp onboarding: invite-link message, not adding people by number
6. Year-end: final export, then delete, with a dated record

`src/core/vcard.js` already renders cards; only the consent filter and the file assembly are
missing. `fuerKlassenliste()` and `fehlendeKinder()` in `model.js` supply items 1 and 4.

**Done when:** a class list, a `.vcf` and both CSVs come out of a project with one click
each, and nothing without recorded consent appears in any of them.

## 3 — Delegate self-setup `/start/`

The QR code on the teacher's sheet points here. A newly elected delegate opens it on a phone
and gets back their class form link plus a ready-to-paste announcement.

**Sixty seconds, no account.** Inputs: class (from the list in `site.config.json`), own name,
own email or mobile. Outputs: the link `/f/<slug>/?d=<contact>`, a QR of it, and a short
German message they can paste into Escola or a chat.

**Done when:** a phone-only run produces a working link that prefills the recipient in the
parent form.

## 4 — Confirm the class list

`site.config.json` currently lists a **guess**: KiGa 1–3, Klasse 1a/1b, 2a/2b, 3a/3b, 4a/4b,
5, 6. Which years actually split a/b changes annually.

**Done when:** the 13 entries match reality. A name the parser cannot read fails the build
rather than producing a wrong slug, so a mistake here is loud rather than silent.

## 5 — Batch generator for the print run

Nice-to-have, not a blocker: `/kit/` already offers per-class links, so printing means
opening 13 pages and typing "22" into the print dialog.

**Done when:** one run produces 13 teacher sheets plus 13 labelled family-sheet stacks.

## 6 — Single-file offline build

An inliner (~50 lines of Node) folding everything into one `dist/klassenkontakte.html`,
because `file://` blocks ES module imports. For delegates who want a local copy.

**Watch out:** `file://` has a different origin and therefore different IndexedDB storage
than the hosted page. See the trap section in [`docs/workbench.md`](workbench.md).

## 7 — Verify contact cards on real devices

An unverified assumption: that vCard 3.0 `CATEGORIES` survives import into iOS Contacts,
Google Contacts and Outlook as a usable group, and that a stable `UID` makes a re-import
update rather than duplicate.

**Done when:** all three have been tried on real devices and the export adjusted to whatever
actually holds.

## 8 — QR scanning in the workbench

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
  could make most of this tool unnecessary. Worth knowing before item 2 gets built.
- **HTTPS certificate** for `bungi-eltern.mrpia.ch`. DNS is correct and GitHub reports
  `is_https_eligible: true` with `caa_error: null`, so it is their issuance queue. When it
  lands, set `https_enforced` to `true`.

## Ground rules worth not rediscovering

- **English for developers, German for parents and delegates.** See the README.
- **No `connect-src` in any CSP.** It is the one load-bearing promise: the pages cannot send
  a class's data anywhere. Loading a library or an icon from a CDN breaks it.
- **Normalise on the way in, never in a renderer.** `einreichungAufnehmen()` does it, so no
  output has to wonder whether a value is clean.
- **Consent absent is "unknown", never "no".** Old lists and WhatsApp groups arrive without
  consent, stay out of everything shared, and get flagged for asking.
- **A visible duplicate beats a silent mix-up.** Where a match is ambiguous, create a second
  entry and let the delegate see it.
- `npm test` gates every deploy. That is deliberate: `test/qr.test.js` keeps the printed QR
  codes scannable, so a change that would ruin 290 sheets fails in CI instead.
