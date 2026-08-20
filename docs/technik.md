# Technische Entscheide

## Kein Framework, keine Laufzeit-Abhängigkeiten

Vanilla JS, kein Framework, kein npm-Baum. Zwei kleine MIT-Bibliotheken werden
*vendored* (QR erzeugen, QR lesen), fest eingecheckt, nie per CDN.

Grund: dieses Werkzeug wird jedes Jahr an neue Delegierte weitergegeben und soll in
fünf Jahren noch starten. Ein Framework mit 400 transitiven Paketen tut das nicht, eine
einzelne HTML-Datei schon. Zweiter Grund: Vertrauen. Eine Delegierte oder ein
Elternteil mit IT-Kenntnissen kann eine Datei ohne Build-Prozess tatsächlich lesen.

## Drei Modi, ein Codebase

| Modus | URL | Wer |
|---|---|---|
| Werkstatt (Import, Bereinigung, Ausgaben) | `/` | Delegierte |
| Elternformular | `/formular?k=<klasse>` | Eltern, mobil |
| Kit-Generator (QR-Zettel, Papierformular, Merkblatt) | `/kit` | Präsident |

Gehostet als statische Dateien auf einer Subdomain von `mrpia.ch`. Zusätzlich eine
Einzeldatei `dist/klassenkontakte.html` für den Offline-Gebrauch.

## Exfiltration ist strukturell unmöglich, nicht nur versprochen

Die Seite trägt ein CSP-Meta-Tag ohne `connect-src` und ohne `form-action`:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
               img-src 'self' data: blob:; media-src blob:; base-uri 'none'; form-action 'none'">
```

Damit blockiert der Browser selbst jeden `fetch`, `XHR`, `WebSocket` und `sendBeacon`.
Die Werkstatt *kann* keine Daten irgendwohin senden, auch wenn sie es wollte. Das ist in
einer Zeile prüfbar und schlägt jedes "vertrau mir".

Ehrlich benannte Restgrenze: die gehostete Version liefert der Präsident aus, er könnte
morgen eine andere ausliefern. Gegenmittel: offener Quellcode, getaggte Releases, und
die Einzeldatei, die eine Delegierte lokal speichert, ist eingefroren.

## Speicherung

Quelle der Wahrheit ist eine Projektdatei (JSON), die die Delegierte selber speichert.
Dazu IndexedDB als Autosave, damit niemand Arbeit verliert. Nicht `localStorage`:
auf `file://` behandelt Chrome den Origin als opaque, das ist unzuverlässig.
File System Access API wo vorhanden (Chrome/Edge: echtes Speichern an Ort), sonst
Download-Fallback.

## PDF: Druck-CSS statt PDF-Bibliothek

`@media print` plus "Als PDF speichern" des Browsers. Bessere Typografie als jede
eingebettete JS-PDF-Bibliothek, null Kilobyte, funktioniert offline.

## CSV: zwei Konventionen, absichtlich

- Excel-Liste (CH/DE-Locale): Semikolon als Trennzeichen, UTF-8-BOM. Eine
  kommagetrennte Datei öffnet sich in einem deutschen Excel als Buchstabensalat.
- Google-Contacts-Import: Komma, wie Google es erwartet.

Verwechslung der beiden ist der klassische Fehler, darum getrennte Buttons mit
eindeutigen Dateinamen.

## Kontaktkarten

vCard **3.0**, nicht 4.0 — beste Importtreue über iOS, Google Contacts und Outlook.
`FN` nach dem Muster `Müller Sophie [Léa · 3a]`, `CATEGORIES` mit Klasse und Schuljahr.
Ob iOS die Kategorien beim Import wirklich zu Gruppen macht, ist unbestätigt und wird
vor dem Elternabend auf echten Geräten getestet.

## Nutzlast für QR und Paste

- QR: kompaktes JSON, UTF-8, Byte-Modus. Eine Familie mit zwei Bezugspersonen und
  Adresse liegt bei ~300–400 Bytes, das passt bequem.
- WhatsApp/E-Mail: ein **lesbarer** strukturierter Block, kein Base64. Die Eltern sollen
  sehen, was sie senden — das ist Teil der Einwilligung. Der Parser ist tolerant
  gegenüber Autokorrektur und Zeilenumbrüchen.

## Aufbau und Tests

Reine Logik (Telefon, Namen, Dedup, vCard, CSV, Parser) liegt in `src/core/` als
ES-Module, ohne DOM-Zugriff. Damit:

- Entwicklung: Module über `python3 -m http.server`
- Tests: `node --test`, dieselben Module
- Auslieferung: ein Inliner (~50 Zeilen Node) baut alles in eine klassische
  `<script>`-Datei, weil `file://` ES-Modul-Imports blockiert

Das ist der Grund für den Inliner: nicht Optimierung, sondern `file://`.

## QR-Codes als SVG

`src/core/qr.js` erzeugt SVG mit einem einzigen `<path>`, nicht Canvas und nicht PNG.
Ein bei 96 dpi gerastertes Canvas, auf 600 dpi gedruckt, zeigt sichtbar gestufte
Modulkanten — genau so wird ein Code unter Neonlicht im Schulhaus unzuverlässig. SVG
rastert der Drucker in seiner eigenen Auflösung.

Ein `<path>` statt eines `<rect>` pro Modul: ein Version-3-Code hat rund 400 dunkle
Module, und 400 Rechtecke pro Code, mal drei Codes, mal 13 Klassen, sind viel Markup für
null sichtbaren Unterschied.

Die Ruhezone liegt **innerhalb** der gedruckten Fläche. `qrPrintSize()` rechnet das aus,
und ein Test hält alle gedruckten URLs über 0,6 mm pro Modul bei 24 mm Kastenbreite.

## Bibliotheken werden eingecheckt, nicht installiert

Siehe `src/vendor/README.md`: byte-identisch, mit sha256 dokumentiert, MIT. Kein npm zur
Laufzeit, kein CDN. Ein QR-Encoder braucht Reed-Solomon-Fehlerkorrektur und
Maskenbewertung — genau der Code, der richtig aussieht, den Smoke-Test besteht und dann
auf jedem zehnten Handy nicht scannt.
