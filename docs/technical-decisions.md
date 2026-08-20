# Technical decisions

## No framework, no runtime dependencies

Vanilla JS, no framework, no npm tree. Two small MIT libraries are *vendored*, checked in,
never loaded from a CDN.

Reason: this tool is handed to new delegates (Klassendelegierte) every September and should
still start in five years. A framework with 400 transitive packages will not; a single HTML
file will. Second reason: trust. A delegate or a parent with some IT knowledge can actually
read a file that has no build process behind it.

## Three modes, one codebase

| Mode | URL | For whom |
|---|---|---|
| Workbench — import, cleanup, outputs | `/w/` | the delegates |
| Parent form (Elternformular) | `/f/<class>/` | parents, on a phone |
| Kit generator — QR slips, paper form, notice | `/kit/` | the president |

Hosted as static files on a subdomain of `mrpia.ch`. Plus a single file
`dist/klassenkontakte.html` for offline use.

## Exfiltration is structurally impossible, not merely promised

Every page carries a CSP meta tag with no `connect-src` and no `form-action`:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'self'; style-src 'self';
               img-src 'self' data: blob:; base-uri 'none'; form-action 'none'">
```

The browser itself then blocks every `fetch`, `XHR`, `WebSocket` and `sendBeacon`. The page
*cannot* send data anywhere, even if it wanted to. That is checkable in one line and beats
any "trust me".

Making it possible drove real structure: script and stylesheet live in separate files and
all values arrive via `<meta>` tags, so there is no inline anything and no `'unsafe-inline'`
escape hatch. The policy earned its keep within a minute of the first browser test by
rejecting one leftover `style` attribute.

Honestly stated limit: the hosted version is served by the president, who could serve a
different one tomorrow. Mitigations: open source, tagged releases, and the single file a
delegate saves locally is frozen.

## Storage

Source of truth in daily use is IndexedDB; the project file is backup and migration. Not
`localStorage`: on `file://` Chrome treats the origin as opaque, which is unreliable.

See `docs/workbench.md` for the storage contract, including the trap that the offline file
has a different origin and therefore different storage.

## PDF: print CSS instead of a PDF library

`@media print` plus the browser's own "Save as PDF". Better typography than any embedded JS
PDF library, zero kilobytes, works offline.

## CSV: two conventions, deliberately

- Excel list (CH/DE locale): semicolon separator, UTF-8 BOM. A comma-separated file opens
  as garbage in a German Excel.
- Google Contacts import: comma, as Google expects.

Confusing the two is the classic mistake, hence separate buttons with unambiguous filenames.

## Contact cards

vCard **3.0**, not 4.0 — best import fidelity across iOS, Google Contacts and Outlook.
`FN` follows `Sophie Müller (Léa)`, natural reading order, short enough to survive
truncation in a WhatsApp header. `N` is structured so the phone still sorts by surname.
`ORG` carries the class, which iOS and Android render under the name. `CATEGORIES` carries
class plus school year for later cleanup, and a stable `UID` gives importers a chance to
update rather than duplicate.

Whether iOS really turns categories into groups on import is unconfirmed and gets tested on
real devices before the parents' evening (Elternabend).

## QR codes as SVG

`src/core/qr.js` emits SVG with a single `<path>`, not canvas and not PNG. A canvas
rasterised at 96 dpi and printed at 600 dpi shows visibly stepped module edges — that is
how a code becomes unreliable under fluorescent light in a school building. SVG lets the
printer rasterise at its own resolution.

One `<path>` instead of one `<rect>` per module: a version-3 code has around 400 dark
modules, and 400 rectangles per code times three codes times 13 classes is a lot of markup
for no visible difference.

The quiet zone sits **inside** the printed area. `qrPrintSize()` computes what that leaves,
and a test keeps every printed URL above 0.6 mm per module at a 24 mm box width.

## Payload for QR and paste

- QR: compact JSON, UTF-8, byte mode. A family with two caregivers and an address is around
  300–400 bytes, which fits comfortably.
- WhatsApp/email: a **readable** structured block, not base64. Parents should see what they
  are sending — that is part of the consent. The parser tolerates autocorrect and line breaks.

## Libraries are checked in, not installed

See `src/vendor/README.md`: byte-identical, documented with sha256, MIT. No npm at runtime,
no CDN. A QR encoder needs Reed-Solomon error correction and mask evaluation — exactly the
kind of code that looks right, passes a smoke test, and then fails to scan on one phone in
ten.

## Layout and tests

Pure logic (phone, names, dedup, vCard, CSV, parser) lives in `src/core/` as ES modules with
no DOM access. Therefore:

- development: `npm run dev` builds and serves on `localhost:8080`
- tests: `node --test`, the same modules
- delivery: an inliner (~50 lines of Node) folds everything into one classic `<script>`
  file, because `file://` blocks ES module imports

That is the reason for the inliner: not optimisation, but `file://`.

## Asset URLs carry a content hash

`site/f/3a/index.html` references `/assets/f/formular.js?v=3e19eb28`, where the query is a
short sha256 of the file's contents.

HTML and JS are separately cached files. After a deploy a browser can hold the old script
and fetch the new page, and then the two disagree about element ids and field names. That is
a failure a delegate cannot diagnose and cannot fix by reloading — and it is not
hypothetical: it happened during the English rename, where a cached script kept looking for
`#kind-vorname` while the page had already become `#child-first-name`.

Hashing the URL means new content is a new URL, so the pair can never come apart, while
unchanged assets stay cached. This is the whole of the build's cache strategy; there is no
service worker and no manifest.

## Language rule

**English for everything a developer reads** — code, comments, specs, commit messages.
**German for everything a parent or a delegate reads** — web pages, printed sheets, the
information notice (Merkblatt), UI strings. The parent form additionally offers English.

Names of real things keep their German form and are glossed on first use: Elternrat
(parents' council), Klassendelegierte (class delegates), Elternabend (class parents'
evening), Merkblatt (information notice), Klassenzug (a class that stays together for
several years), KiGa (kindergarten).
