# Workbench (`/w/`) — implementation spec

Goal: this file should be enough to build `/w/` in a fresh session without knowing how the
project got here. Where a decision looks open, it has been made here.

**Status: built on 2026-08-20**, all ten acceptance checks below walked in a browser. The
sections marked *learned while building* record what this document got wrong or left out;
they are the newer decision where the two disagree.

Language: see [`CLAUDE.md`](../CLAUDE.md). Identifiers, ids, CSS classes and codes in
English; everything a delegate reads on screen in German.

## Purpose

The workbench is the delegates' tool. It takes in parents' submissions, holds the class
dataset, and later produces the outputs. It runs entirely in the delegate's browser. There
is no server and no database anywhere else.

**In v1:** take a submission in from a link, list the families collected, view and change
consent, type in paper forms, save and load the project file, delete.

**Not in v1:** the six outputs (separate task, see `docs/requirements.md`), QR scanning,
Escola Excel import, the "new school year" routine.

## Location, files, CSP

```
src/w/index.html      shell, values in <meta>, no inline script, no inline style
src/w/workbench.css   → /assets/w/workbench.css
src/w/workbench.js    → /assets/w/workbench.js
```

The build treats `src/w/` exactly like `src/f/` (see `tools/build.mjs`), but writes **one**
page to `site/w/index.html`, not one per class: the class comes from the project, not the URL.

Same strict CSP as the parent form, with one addition:

```
default-src 'none'; script-src 'self'; style-src 'self';
img-src 'self' data: blob:; form-action 'none'; base-uri 'none'
```

`blob:` on `img-src` is there for the outputs still to come, which will render QR codes and
previews through `URL.createObjectURL`. *Learned while building:* the original reason given
here — downloads — was wrong. A download through `<a download>` with a blob URL is not an
image fetch and is governed by none of these directives; it was tested under exactly this
policy and works. The directive stays for the previews.

**No `connect-src`** — the page cannot send the class's data anywhere, and that is
verifiable in one line. Anyone who later loads a library or an icon from a CDN has broken
the only load-bearing promise this tool makes.

*Learned while building:* `fetch` and `XMLHttpRequest` are refused with a console error, as
expected. **`navigator.sendBeacon` returns `true` anyway** — Chromium queues the beacon
before applying CSP and then drops it. Nothing reaches the wire (checked against the server
log: every request a GET, no beacon), but the return value is a false reassurance, so do not
use it as the check. Read the console, or the server log.

## Data flow when taking a submission in

Parents send a message containing a readable block and, below it, a link of the form
`https://bungi-eltern.mrpia.ch/w/#d=<base64url>`. The delegate taps it.

1. On load, read `location.hash`. If it starts with `#d=`, pass the rest to
   `decodeSubmission()` from `src/core/payload.js`.
2. **Immediately afterwards call `history.replaceState(null, '', location.pathname)`.**
   Otherwise the payload stays in the browser's history and comes back with the back
   button — on a shared family laptop that is another family's contact details sitting in a
   history other people can see. This is the step most likely to be forgotten when
   rebuilding.
3. If decoding fails, show `r.text` — a German sentence; `r.code` is there for branching —
   plus a note that the readable part of the message can be typed in by hand. Never a blank
   page.
4. On success do **not** store immediately. Show a confirmation step: `readableSummary()`
   of the submission, and below it what taking it in would do. Get that by running
   `ingestSubmission()` against a **copy** of the project (`structuredClone`) and
   displaying `outcome` and `changes`:
   - `new` → "New family: Léa Müller"
   - `updated` → the list from `changes`, which are ready-made German sentences
   - `unchanged` → "These details are already recorded"
5. Only on click, run the same function against the real project and save.
6. Always show `notes` from the result — each is `{code, text}`, covering unreadable
   numbers and suspected typos. Never correct them automatically.

### Trap: a load handler alone catches only half the arrivals

*Learned while building, and it cost an acceptance check.* Steps 1 and 2 above describe
what happens **on load**. Tapping `/w/#d=…` while the workbench is already open in that tab
is a *same-document* navigation: the browser changes the fragment, fires `hashchange`, and
**does not re-run the module**. With only the load path implemented, the page sat there
doing nothing while the payload stayed in the address bar — and a delegate with the tool
open in a tab is the ordinary case, not the edge case.

So the reading and the scrubbing belong in one function called from **both** places:

```js
function takeHash() {
  const found = submissionFromHash(location.hash);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  return found;
}
const arriving = takeHash();
window.addEventListener('hashchange', () => { const f = takeHash(); if (f) handleArriving(f); });
```

`replaceState` does not fire `hashchange`, so this cannot loop.

### Trap: a percent sign in the payload

base64url needs no escaping, so a `%` in the fragment can only have been added on the way
through — some mail clients re-encode fragments. Try `decodeURIComponent` before reporting a
broken link the delegate can see is intact.

### Class does not match

If the submission names a different class than the open project, do **not** take it in
silently. Message: "These details belong to Klasse 3a, KiGa 1 is open." Offer two choices:
switch to the other class's project (if it exists) or create it. A delegate can have two
children in two classes and hold both roles.

## Storage

Source of truth in daily use is IndexedDB. The project file is backup and migration.

```
Database:  klassenkontakte          // the product name, a proper noun
Version:   1
Store:     projects, keyPath 'slug'                  // '3a', 'kiga1', ...
Record:    { slug, project, savedAt, openedAt }      // project = the object from model.js
```

*Learned while building:* `openedAt` is the addition. Something has to remember which class
to reopen, and the obvious answer — a second store, or a localStorage key holding the
current slug — leaves a pointer that "delete everything" turns into a dangling reference.
Stamping the record itself and reopening the most recently stamped one needs no second
place to keep consistent, and it happens to give a delegate with two classes the one they
were last in.

- Autosave after **every** change, debounced by 500 ms. Delegates must not lose work because
  they forgot to save. Flush on `visibilitychange` too: that is the hook that actually fires
  when a phone browser is put away, and `beforeunload` frequently does not.
- **Cancel the pending save before deleting.** A debounced flush that fires after
  `removeRecord` writes the project straight back in, and the delegate who just typed a
  class name to confirm the deletion is the last person who would check.
- Visible state in the page header: "Saved 14:32" or "Not saved".
- Project file: `projectToJson()`, downloaded as
  `klassenkontakte-<slug>-<YYYY-MM-DD>.json`.
- Loading: `<input type="file">`, `projectFromJson()`, then **confirm with counts** ("File
  contains 18 families, 4 are open. Replace?"). v1 **replaces**, it does not merge: merging
  two datasets is its own task and nobody needs it in the first year.
- **No File System Access API.** `docs/technical-decisions.md` holds it out as a
  possibility; that is overruled here. It exists only in Chrome and Edge, and download plus
  file picker works identically everywhere, phones included. Should that document ever be
  revised, this line is the newer decision.

### Trap: `file://` has separate storage

The later single-file build for offline use runs under `file://` and therefore has a
**different origin than the hosted page — and so a different IndexedDB store.** Anyone
switching between the two sees two different datasets and concludes one was lost.

Therefore: always show in the page header where the page was loaded from ("online version"
or "offline file"), and on first start of the offline file explain once that the data is
separate. The project file is the bridge between them.

## Screens

**First run, no project.** Explain briefly what the tool is and that the data does not leave
the device. Then: choose the class (list from `site.config.json`, baked in via `<meta>`, use
`parseClassName()` for display name and slug), delegate names optional. Alternatively "load
project file".

**Main screen.** Header: class, school year, save state, which version of the page. Then a
list **grouped by child** — the grouping key everywhere is the child, not the household. Per
child, the caregivers with role, email, number, and address if given, plus two state markers
for list and WhatsApp group with three possible values: yes, no, **unknown**. "Unknown" must
look visibly different from "no"; it is the reason this tool exists.

Counters at the top: "14 of 22 families · 11 on the class list · 3 without consent".

**Typing in a paper form.** The same form as `/f/`, but stored locally instead of sent.
Reachable via "add a family by hand". Keyboard-friendly: tab between fields, Enter saves and
opens a fresh empty form, because a delegate at the kitchen table types twenty slips in a row.
Enter needs no key handling: a form submit is what Enter in a text field already does, and
`form-action 'none'` means a missed `preventDefault` cannot become a request.

*Learned while building — one deliberate departure from "the same form as `/f/`".* The two
consent checkboxes are **three radio buttons each**: ja, nein, and *nicht angekreuzt*,
defaulting to the last. On the parent form an unticked box means the parent read the
question and declined. On a paper slip it far more often means they skipped it, and
recording that as a refusal is precisely the mistake the whole third state exists to
prevent. This needed a two-line change in `consentFrom()`: a consent field that is absent
or `UNKNOWN` now stays unknown per field, instead of the block being all-or-nothing.

**Changing consent.** Toggleable directly in the list, with the date of the change recorded
in the log. A withdrawal by phone must be recordable in ten seconds.

Implemented as one tappable pill per question, cycling **unbekannt → ja → nein → unbekannt**.
No cycle order makes both common moves a single tap; this one favours the withdrawal, since
"she phoned to say take me off" starts from a recorded yes. The pill is replaced in place
rather than the list redrawn, so a second tap lands on the same spot. `setConsent()` in
`model.js` does the mutation and writes the log line.

**Deleting.** A single person (`deleteCaregiver()`, which also clears orphaned children) and
"delete everything", confirmed by typing the class name.

## Functions to use

All from `src/core/`. Do not rebuild any of it, and **do not normalise again**:
`ingestSubmission()` does that on the way in, so that no output ever sees raw input.

| Function | Module | For |
|---|---|---|
| `decodeSubmission` | payload.js | unpack the link, never throws |
| `readableSummary` | payload.js | the confirmation step |
| `newProject`, `ingestSubmission` | model.js | project and intake |
| `caregiversForChild` | model.js | grouping by child |
| `forClassList`, `forWhatsappGroup`, `consentUnrecorded` | model.js | counters and filters |
| `missingChildren` | model.js | chase list (needs the class roster as input) |
| `projectToJson`, `projectFromJson`, `deleteCaregiver` | model.js | file and deletion |
| `parseClassName`, `compareClasses` | classname.js | class picker, sorting |
| `setConsent` | model.js | a withdrawal recorded by phone (added while building) |

`missingChildren()` is listed above but unused in v1: it needs the class roster as input,
and nothing types a roster in yet. It belongs with the chase list, which is one of the six
outputs.

Three modules were added under `src/w/`, all free of the DOM so they can be unit-tested in
node — `intake.js` (hash → decision), `format.js` (the German a delegate reads), and
`storage.js` (IndexedDB). `workbench.js` is the only file that touches the page.

The confirmation step in step 4 above is `previewIngest()`: `structuredClone` the project,
run the **real** `ingestSubmission` against the copy, and diff the ids to name what would be
added. The tempting alternative — a second function that predicts the merge — drifts from
the real one within a month and then lies at the exact moment a delegate is trusting it.

## Acceptance checks

A fresh implementation is done when all of this can be walked through by hand:

1. Fill in the form at `/f/3a/`, choose "send by email", open the link from the message in
   `/w/` → the confirmation step shows exactly that family.
2. After taking it in, `location.hash` is **empty**, and the back button does not bring the
   payload back.
3. A second submission for the same family with a changed number → `updated`, the change is
   shown in plain words before it is applied, no duplicate.
4. A second submission naming only one of two people → the other person is untouched.
5. Reload the page → everything is still there, without anyone having saved.
6. Download the project file, "delete everything", load the file → identical state.
7. Open a broken link (`#d=nonsense`) → an understandable message, not a blank page.
8. A submission from `/f/3a/` while a KiGa 1 project is open → warning, no silent intake.
9. Record a family with no consent → appears as **unknown**, not as "no", and is not counted
   by `forClassList()`.
10. Check in the browser: no `connect-src` in the CSP, and no outgoing request in the network
    panel after entering data.
