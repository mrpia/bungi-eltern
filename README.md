# Klassenkontakte

*[Deutsch](#deutsch) · [English](#english)*

---

## Deutsch

Werkzeug für die Klassendelegierten eines Elternrats: Kontaktangaben der Klasseneltern
einsammeln, Einwilligungen sauber erfassen, und daraus ohne Handarbeit eine Klassenliste,
Kontaktkarten und eine WhatsApp-Einladung erzeugen.

Läuft vollständig im Browser. Keine Datenbank, kein Server, kein Konto.
Die Daten einer Klasse verlassen den Rechner der Delegierten nicht — und können es nicht:
die Seiten tragen eine Content-Security-Policy ohne `connect-src`, womit der Browser jede
ausgehende Anfrage blockiert.

Öffentliche Seiten sind auf Deutsch, das Elternformular zusätzlich auf Englisch.
Für die Schule Bungertwies, Zürich: <https://bungi-eltern.mrpia.ch>

## English

A tool for the class delegates (Klassendelegierte) of a parents' council (Elternrat):
collect the contact details of a class's parents, record consent properly, and turn that
into a class list, contact cards and a WhatsApp invitation without manual work.

Runs entirely in the browser. No database, no server, no account. A class's data never
leaves the delegate's machine — and cannot: every page carries a Content-Security-Policy
with no `connect-src`, so the browser blocks any outgoing request.

**Language rule:** English for everything a developer reads — code, comments, specs, commit
messages. German for everything a parent or a delegate reads — web pages, printed sheets,
UI strings. The parent form additionally offers English.

### Documents

| File | What |
|---|---|
| [`docs/todo.md`](docs/todo.md) | **What is left to build.** Start here. |
| [`docs/requirements.md`](docs/requirements.md) | Requirements, with the dated revisions that shaped them |
| [`docs/technical-decisions.md`](docs/technical-decisions.md) | Technical decisions and the reasoning behind them |
| [`docs/workbench.md`](docs/workbench.md) | Implementation spec for `/w/`, written to be built from cold |
| [`docs/hosting.md`](docs/hosting.md) | GitHub Pages, DNS, deploy, and the two auth traps |
| [`docs/escola-research.md`](docs/escola-research.md) | What the school's Escola platform can already do |
| [`src/vendor/README.md`](src/vendor/README.md) | Vendored libraries, with checksums |

### Getting started

```bash
npm test          # 67 tests, no dependencies
npm run build     # assembles site/ from src/
npm run dev       # build, then serve on localhost:8080
```

There is nothing to install. `package.json` has no dependencies; the two vendored libraries
are checked in.

### Layout

```
src/core/     pure logic, no DOM: phone, names, email, class names, school years,
              vCard, QR, payload, data model. Covered by tests.
src/f/        parent form, one page per class
src/kit/      printable sheets: family sheet, teacher sheet, information notice
src/w/        delegate workbench (not built yet)
src/vendor/   checked-in MIT libraries
tools/        the build script
```
