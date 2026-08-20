# Klassenkontakte — Requirements, locked 2026-08-20

Working language of this document: English. Everything user-facing (parent form, paper
form, information notice, workbench UI) is **German**, with an **English toggle on the
parent-facing form only**.

## Context

Primary school in Switzerland (German-speaking). A parents' council (Elternrat) of two
class delegates per class meets 5x/year with the school director, teacher
representatives and the after-school-care staff. Delegates are the two-way membrane
between their class and the council: minutes, decisions and calls to action go down,
questions come up, and parent-run events (summer party) need coordination.

The school runs **Escola** and can already broadcast to all parents or to one class,
but the school will not hand parent contact data to parents or delegates.

## Purposes

1. **Council ↔ class communication.** The delegate must be able to reach every family of
   their class. Not consent-gated: a family that gives nothing simply doesn't get the
   delegate's messages, and still gets school information via Escola. No penalty, but a
   consequence, and the information notice says so.
2. **Voluntary class contact list + optional class WhatsApp group.** Consent-gated,
   opt-in only.

## Pain being solved (ranked by the president)

1. Delegates fumble the setup of the current Google Forms flow.
2. Producing the list, the contact cards and the WhatsApp group is manual drudgery.
3. Privacy and inconsistency: every class does it differently, wording varies, nobody
   knows where the data ended up.

Explicitly **not** a pain: parent response rate. Collection happens in person at the
class parents' evening, plus contacts delegates already hold.

## Hard constraints

- No database, no backend that the council or the president operates.
- No account required from a delegate. The "copy this Google Form into your account"
  step is removed: it is pain #1 and it makes wording drift, which is pain #3.
- Runs on any OS in a normal browser. Hosted as static files on a subdomain of
  `mrpia.ch`, plus a single-file offline copy.
- The president must not be able to read class data. Enforced structurally, not by
  promise (see `docs/technik.md`, CSP).
- **One owner per class.** Two delegates exist, but only one holds the dataset. No sync,
  no key sharing, no encrypted project exchange. This removed a large chunk of v1.

## Data model

Four entities, not one row per family. This is the part that is expensive to retrofit.

- `Pupil` — first name, last name, class, siblings
- `Household` — street, postcode, town (all optional), which pupils live there
- `Caregiver` — first name, last name, relationship, email, mobile, household, pupils
- `Consent` — attached to the caregiver: captured at, source (form / paper / legacy
  import), version of the notice text shown, and the two answers below

Rationale: a separated couple has two households for one pupil, one parent may be in
the shared list and the other not, and a confidential address must be representable.
A flat spreadsheet row cannot express that.

## Consent model

Two questions, per caregiver:

1. `shareInClassList` — include me in the class contact list shared with the other
   parents of this class
2. `whatsappGroup` — add me to the class WhatsApp group

Not a question: contact by the delegate for council matters. It is the purpose of the
role. The notice informs, it does not ask.

The confidential-address case is handled by the postal address being **plainly
optional**, not by a third tick. Shorter form, same protection.

Anything imported without a recorded answer (old lists, WhatsApp groups, last year's
file, typed-off paper without the tick) is flagged **`consent: unknown`** and is
excluded from every shared output until confirmed. This flag is the direct answer to
pain #3.

## Fields collected

Core: pupil first + last name, class; per caregiver first + last name, relationship,
email, mobile. Optional: postal address. Structural: second household, siblings.

Dropped by decision: family language, preferred channel. Out of scope entirely:
allergies, emergency contacts, birthdays, photos — the school owns those.

## Outputs, one click each, no editing by the delegate

1. Printable class list, A4, consent-filtered, dated and version-stamped
2. Contact cards: multi-vCard, Google Contacts CSV, Outlook CSV. Naming convention
   `Müller Sophie [Léa · 3a]` so an incoming message is identifiable, plus a category
   tag for later cleanup
3. BCC address string and a pre-addressed mail launcher, with a hard warning against
   To/CC
4. Chase list: which roster pupils have no submission yet, plus a ready reminder text
5. WhatsApp onboarding: invite-link message, not adding people by number
6. Year-end: final export, then delete, with a dated record

## Normalisation, so the delegate never edits anything

Phone to E.164, +41 default, Swiss mobile prefixes 075–079, neighbours +33/+49/+39/+43
for cross-border families. Name capitalisation that survives `de`, `van`, `O'` and
hyphens. Email trim and lowercase domain. Duplicate merge when a parent resubmits with
a corrected number, newest wins, with the older value kept visible.

## Roster

Delegates may legitimately know which children are in their class. The roster is an
input, which makes the chase list precise instead of a guess.

## Collection channels, in build order

The importer is a generic adapter with column mapping in the UI. The transport decision
is therefore reversible and blocks nothing.

1. **Paper** — printed form at the parents' evening, plus fast typed entry. Always works.
2. **QR in the room** — parent fills the form on their phone, the page renders their own
   answers as a QR, the delegate's laptop scans it off the screen. ~300 bytes per
   family, no channel, no accounts, nothing leaves the room.
3. **Send to delegate** — prefilled WhatsApp or email for parents not present, bulk
   paste into the workbench.
4. **Escola survey export** — if the director allows it. See `docs/escola-abklaerung.md`.

## Cut from v1

End-to-end encryption of submissions, any central collection point, multi-delegate
sync. The crypto option only earned its place when a central form was on the table;
with one owner per class and a four-week deadline it buys nothing.

## Deadline

First class parents' evening within 4 weeks of 2026-08-20. Build order is risk-managed:
workbench first, then paper form and QR slip, then the digital form, then QR scanning.
If items 3 and 4 slip, paper plus typed entry still carries the evening.

---

# Revision 2026-08-20, later the same day

Two facts from the president invalidated part of the plan above. Recorded here rather
than silently edited in, because the reasoning matters for anyone picking this up.

## Class names

Three shapes, all in use: `KiGa 1`, `Klasse 4` (no section that year), `Klasse 3a` /
`Klasse 3b` (split years). Implemented in `src/core/classname.js` with four
representations, which are deliberately not interchangeable:

| | example | used for |
|---|---|---|
| display | `Klasse 3a` | headings, printed list, information notice |
| short | `3a`, `KiGa 1` | inside a contact card name, where space is scarce |
| slug | `3a`, `kiga1` | URLs and file names |
| sortKey | number | KiGa before Klasse 1, 3a before 3b |

## Delegates are elected AT the parents' evening

This broke the assumed sequence. At the moment of the meeting there is no delegate, no
briefing, and no tool in anyone's hands; the president's list of delegate addresses only
exists afterwards. And delegates have **smartphones, not laptops**.

Consequences:

- **Nothing in the room may depend on knowing who the delegate is.** No prefilled
  message to a delegate, no QR scanning by a delegate's laptop.
- **Collection moves to after the evening.** Justified by the president's own ranking:
  parent response rate is not a pain. The parents' evening is for the election and for
  handing out paper, not for data capture.
- The paper package is prepared per class by the president in advance and handed to the
  **teacher**, not to a delegate.
- The elected delegate configures themselves afterwards, on a phone, in about a minute:
  name, own email or mobile, class → out comes their personal class form link, a QR, and
  a ready-to-paste announcement. This is what replaces the Google Form copy step.

## Transport, revised: a deep link the parent sends and the delegate taps

The parent's submit produces a WhatsApp or email message with a readable summary **plus a
link into the workbench carrying the family's data in the URL fragment**. The delegate
taps it, the workbench asks to confirm, and stores it. One tap per family, no
copy-paste, works entirely on a phone.

Why the fragment: everything after `#` is never transmitted to the server by the browser,
so the payload stays client-side even though it travelled as a URL. With the CSP that has
no `connect-src`, the page cannot forward it anywhere either. The readable summary above
the link means the parent sees what they send, which is part of the consent, and the
delegate can still salvage the data by hand if a link ever breaks.

## New requirement: the workbench must work on a phone

Not "responsive enough". Primary device is a smartphone. No drag-and-drop-only import,
no hover-dependent controls, IndexedDB as the primary store rather than a file the
delegate has to manage by hand. An A4 print still wants a computer; the class list as a
shareable PDF and the vCards imported into the phone's own address book do not.

## Re-prioritised

QR scanning off a parent's phone screen (task 8) loses its purpose: it existed to solve
in-room capture by a delegate's laptop, and there is no laptop and no in-room capture.
Kept only as a possible convenience for a delegate who *does* sit down at a computer,
below everything else.

---

# Revision 2026-08-20, third pass: the class train

## How the school is structured

- **Kindergarten**: two years, mixed age, **half the children are new each year**.
- **Klasse 1–3**: one stable group with one stable teacher for three years.
- **Klasse 4–6**: the group is re-formed, then stable again for three years.

A delegate elected at the start of a train often serves the whole train, and therefore
collects properly **once**, at the start.

## Consequence: the class label is not the class identity

The same children and the same teacher are `Klasse 1a`, then `2a`, then `3a`. If the
label is stored as identity:

- every August the delegate rebuilds the dataset from nothing, and
- every contact card sitting in 22 parents' address books carries a stale class.

So a class is identified by **stage + section + the school year the train started**, and
the display label is *computed* for the school year in question. Implemented in
`src/core/schoolyear.js` and `advanceClass()` / `trainEndYear()` in
`src/core/classname.js`.

## Consequence: the annual delta is the main workload, not the initial collection

Kindergarten turns over half its group every year, and every train gains and loses the
odd family. So the workbench needs a **"neues Schuljahr"** function:

1. advance the class label,
2. ask which pupils have left,
3. take the new families through the normal collection path,
4. regenerate the outputs, including refreshed contact cards,
5. warn when the train is ending (`trainEndYear`), because a re-formed class in
   Klasse 4 needs a fresh collection from scratch.

The three big collection moments are therefore: kindergarten entry (annually, the new
half), Klasse 1 (whole new mix), Klasse 4 (whole new mix).

## Consequence: retention is not "delete at year end"

Delete at the **end of the train**, not the end of the school year, with the year-end
function handling departures individually. A family that leaves is removed then, not
three years later.

## Correction to the previous revision: desktop-first is back

A phone is guaranteed at the election evening; a computer at home is also guaranteed.
So only two things must work on a phone:

1. the 60-second delegate self-setup at the election,
2. tapping a parent's submission link.

The workbench proper, the A4 print path and the outputs go back to desktop-first. The
previous revision over-corrected on this point.

## Open question, flagged in code rather than guessed

Does the number in `KiGa 1` identify a **group** (two parallel mixed-age groups, which
is what "half the children new each year" suggests) or a **year level**? The label
advances in the second case and not in the first. `advanceClass()` takes an explicit
`kigaNumberIsYearLevel` flag, defaulting to group, with both branches under test.

---

# Revision 2026-08-20, fourth pass: the printed package

13 classes, so roughly 290 family sheets each September. That number forced a split, after
the first draft measured **468 mm of content against 269 mm of printable A4** — two pages
per family, 580 sheets for the school.

## Three documents instead of one

| Datei | Auflage | Inhalt |
|---|---|---|
| `src/kit/blatt.html` | 1 pro Familie (~290) | Kurzinfo, Wege (QR/Papier), Formular, Einwilligung |
| `src/kit/lehrblatt.html` | 1 pro Klasse (13) | Anleitung für die Lehrperson, Vorlesetext, 2 Delegierten-Zettel |
| `src/kit/merkblatt.html` | 1 pro Klasse + online | Vollständige Datenschutzinformation |

Two things moved deliberately:

- **The full notice left the family sheet.** The long "what happens with your data" text is
  what nobody reads on paper anyway, and the duty to inform is discharged by making the
  notice *available* — one copy per class plus a permanent link on every sheet and on the
  online form.
- **The "you were elected tonight" box left the family sheet.** It belongs on two slips per
  class, not on 22 identical family sheets.

## Measured, not assumed

`src/kit/_messen.html` is a dev-only harness that loads each sheet in an iframe and reports
content height against the page box. Rerun it after every text edit.

| Blatt | Inhalt | Druckbar | Reserve |
|---|---|---|---|
| blatt.html | 225.1 mm | 269 mm | 43.9 mm |
| lehrblatt.html | 228.1 mm | 269 mm | 40.9 mm |
| merkblatt.html | 251.4 mm | 267 mm | 15.6 mm |

## Fonts are pinned to what exists

The first draft asked for `"Source Serif Pro"`, which is installed on no Windows or macOS
machine in this school. Measurements taken in headless Chromium against a fallback are
fiction. The stacks now start at **Georgia**, **Arial** and **Consolas**, all present
everywhere, so measured height equals printed height. On a paper form, a font that reflows
means doubling a 290-sheet print run.

## Merkblatt version string is load-bearing

Every consent record stores which version of the notice the parent saw. Editing
`merkblatt.html` therefore means bumping `version` in the same commit, otherwise the stored
consent points at text that no longer exists.

## Still missing before anything can be printed

1. **QR codes.** All three sheets have placeholder boxes. Needs a vendored MIT encoder.
2. **The subdomain and the real links.** The sheets print URLs; those must resolve before
   290 copies exist.
3. **The 13-class batch generator**, so one run produces 13 teacher sheets and 13 stacks.

---

# Revision 2026-08-20, fifth pass: names, wording, QR

## Decided

- School: **Schule Bungertwies**, Zürich (Kindergartenstufe und Primarstufe, per the
  city's own page — matches the KiGa-plus-Klassen structure).
- Base URL: **https://bungi-eltern.mrpia.ch**. Printed links show the host without the
  scheme; the QR encodes the full URL.
- Contact on the teacher sheet and the notice: **pa.galiana@gmail.com** for now.
- 13 classes, so ~290 family sheets, 13 teacher sheets, 13 notices each September.

## Three wording changes to the parent-facing text

1. **WhatsApp paragraph simplified.** It now says only that every member sees every
   number. The naming of Meta and the transfer abroad is gone — parents know what a
   WhatsApp group is, and the extra sentence made a class list read like a bank contract.
2. **Signature line removed** from the paper form. Consent needs no signature, and the
   line added officialdom that costs completion. The date field stays.
3. **"Haushalt" removed from parent-facing text.** It read as a judgement on separated
   parents. The form now says *"getrennt lebende Eltern füllen je ein Formular aus"*, and
   the second caregiver block is labelled *"optional"* rather than *"falls im selben
   Haushalt"*. The household stays in the data model, where it belongs; it just stopped
   being a word parents have to read.

## QR codes

`src/core/qr.js` renders SVG, not canvas. A canvas rasterised at 96 dpi and printed at
600 dpi shows stepped module edges, which is how a code ends up marginal under a school's
fluorescent light. One `<path>` per code rather than one `<rect>` per module.

Library vendored byte-identical with recorded checksums — see `src/vendor/README.md`.

### The quiet-zone trap, now guarded by a test

The 4-module quiet zone sits **inside** the printed box. A 24 mm slot holding a version-3
code (29 modules + 8 of margin) prints only 18.8 mm of actual code. Sizing by the box and
assuming that is the code size overestimates every module by a fifth. The first draft used
an 18 mm box, which yields 0.49 mm per module — right at the floor where scanning a printed
code off paper starts failing.

`qrPrintSize()` computes this, and `test/qr.test.js` asserts every URL that actually goes
on paper clears 0.6 mm per module at 24 mm. If the subdomain or a class slug grows enough
to push the code to a denser version, a test fails instead of 290 sheets being unscannable.

## Measured after all changes

| Blatt | Inhalt | Druckbar | Reserve | QR |
|---|---|---|---|---|
| blatt.html | 231.1 mm | 269 mm | 37.9 mm | v3, 18.8 mm code in a 24 mm box, 0.65 mm/Modul |
| lehrblatt.html | 228.1 mm | 269 mm | 40.9 mm | 2 × dito |
| merkblatt.html | 246.7 mm | 267 mm | 20.3 mm | keiner |

## Left for the print run

The 13-class batch generator. Everything it needs now exists.

---

# Revision 2026-08-20, sixth pass: the address moves onto the person

**Decision: no parent-facing text singles out separated parents.** The instruction
*"getrennt lebende Eltern füllen je ein Formular aus"* is gone. Instead the address is an
optional field **on each person**. Two people at the same address write it once or twice as
they like; two people at different addresses simply write different ones. Nothing on the
form asks why, and nobody is put in the spotlight.

The form now states what is required, positively: *"Pflicht sind nur der Name des Kindes
und eine Kontaktmöglichkeit."* A form filled in by one parent alone is therefore complete,
which removes the last reason a special instruction would have existed.

## Consequence: Household stops being a declared entity

The form no longer asserts who lives with whom, so the model shrinks from four entities to
three:

- `Pupil` — first name, last name, class, siblings
- `Caregiver` — first name, last name, role, email, mobile, **optional address**, pupils
- `Consent` — attached to the caregiver, with timestamp, source and notice version

The grouping key for every output is the **Pupil**, not the household. That was true all
along; the household was only ever carrying the address. Where a household grouping is
genuinely useful later — carpools, neighbours — it is *derived* by matching normalised
addresses, never asked.

This is a real simplification: an inferred household can be wrong, and a declared one
forced the delegate to answer a question the parents never answered.

## Consequence: a new, load-bearing workbench rule

**Two submissions for the same child must merge, not conflict.** A second submission naming
only one caregiver must never overwrite the other caregiver's data.

This is what makes the wording change safe. Separated parents can each submit their own
form without any instruction telling them to, because the software absorbs it instead of
the paper asking for it. Belongs to the data-model task, with tests.

## Measured after the change

| Blatt | Inhalt | Druckbar | Reserve |
|---|---|---|---|
| blatt.html | 239.2 mm | 269 mm | 29.8 mm |
| lehrblatt.html | 228.1 mm | 269 mm | 40.9 mm |
| merkblatt.html | 246.7 mm | 267 mm | 20.3 mm |
