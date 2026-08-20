# Werkstatt (`/w/`) — Umsetzungsspezifikation

Ziel: diese Datei genügt, um `/w/` in einer frischen Sitzung zu bauen, ohne den
Entstehungsverlauf zu kennen. Wo eine Entscheidung offen wirkt, ist sie hier getroffen.

## Zweck

Die Werkstatt ist das Werkzeug der Klassendelegierten. Sie nimmt Einreichungen der Eltern
auf, hält den Datensatz der Klasse, und erzeugt daraus später die Ausgaben. Sie läuft
vollständig im Browser der Delegierten. Es gibt keinen Server und keine Datenbank
irgendwo sonst.

**In v1 enthalten:** Einreichung per Link übernehmen, Liste der erfassten Familien,
Einwilligungen sehen und ändern, Papierformulare tippen, Projektdatei speichern und laden,
löschen.

**Nicht in v1:** die sechs Ausgaben (eigene Aufgabe, siehe `docs/anforderungen.md`),
QR-Scannen, Escola-Excel-Import, Funktion „neues Schuljahr".

## Ort, Dateien, CSP

```
src/w/index.html      Gerüst, Werte in <meta>, kein Inline-Skript, kein Inline-Stil
src/w/werkstatt.css   → /assets/w/werkstatt.css
src/w/werkstatt.js    → /assets/w/werkstatt.js
```

Der Build behandelt `src/w/` genau wie `src/f/` (siehe `tools/build.mjs`), schreibt aber
**eine** Seite nach `site/w/index.html`, nicht eine pro Klasse: die Klasse kommt aus dem
Projekt, nicht aus der URL.

Dieselbe strenge CSP wie beim Elternformular, mit einer Ergänzung:

```
default-src 'none'; script-src 'self'; style-src 'self';
img-src 'self' data: blob:; form-action 'none'; base-uri 'none'
```

`blob:` bei `img-src` ist nötig, weil die Ausgaben später Downloads über
`URL.createObjectURL` anbieten. **Kein `connect-src`** — die Seite kann die Daten der
Klasse nicht wegsenden, und das ist in einer Zeile prüfbar. Wer eine Bibliothek nachlädt
oder ein Icon von einem CDN holt, hat die einzige belastbare Zusage des Werkzeugs gebrochen.

## Datenfluss beim Übernehmen

Die Eltern schicken eine Nachricht mit einem lesbaren Block und darunter einem Link der
Form `https://bungi-eltern.mrpia.ch/w/#d=<base64url>`. Die Delegierte tippt darauf.

1. Beim Laden `location.hash` lesen. Beginnt er mit `#d=`, den Rest an
   `decodeSubmission()` aus `src/core/payload.js` geben.
2. **Sofort danach `history.replaceState(null, '', location.pathname)` aufrufen.**
   Sonst bleibt die Nutzlast im Verlauf des Browsers stehen und kommt mit der
   Zurück-Taste wieder — auf einem Familienlaptop sind das die Kontaktdaten einer
   fremden Familie in einem Verlauf, den andere sehen. Das ist der Punkt, den man beim
   Nachbauen am ehesten vergisst.
3. Schlägt das Dekodieren fehl, den Grund zeigen (`r.reason`) und dazu den Hinweis, dass
   der lesbare Teil der Nachricht von Hand erfasst werden kann. Nie eine leere Seite.
4. Bei Erfolg **nicht** direkt speichern, sondern einen Bestätigungsschritt zeigen:
   `readableSummary(r.submission)`, und darunter, was das Übernehmen bewirken würde.
   Dazu `einreichungAufnehmen()` auf einer **Kopie** des Projekts laufen lassen
   (`structuredClone`) und `ergebnis` und `aenderungen` anzeigen:
   - `neu` → „Neue Familie: Léa Müller"
   - `ergaenzt` → die Liste aus `aenderungen`, also genau was sich ändert
   - `unveraendert` → „Diese Angaben sind schon erfasst"
5. Erst auf Klick dieselbe Funktion auf dem echten Projekt aufrufen und speichern.
6. `hinweise` aus dem Ergebnis immer zeigen (unlesbare Nummern, Tippfehlerverdacht).
   Nicht automatisch korrigieren.

### Klasse passt nicht

Steht in der Einreichung eine andere Klasse als im offenen Projekt, **nicht** stillschweigend
übernehmen. Meldung: „Diese Angaben gehören zu Klasse 3a, offen ist KiGa 1." Zwei
Möglichkeiten anbieten: zum Projekt der anderen Klasse wechseln (falls vorhanden) oder es
anlegen. Eine Delegierte kann zwei Kinder in zwei Klassen haben und beide Ämter innehaben.

## Speicherung

Quelle der Wahrheit im Betrieb ist IndexedDB. Die Projektdatei ist Sicherung und Umzug.

```
Datenbank:  klassenkontakte
Version:    1
Store:      projekte, keyPath 'slug'      // '3a', 'kiga1', ...
Eintrag:    { slug, projekt, gespeichert }   // projekt = Objekt aus model.js
```

- Autosave nach **jeder** Änderung, entprellt um 500 ms. Delegierte verlieren keine Arbeit,
  weil sie das Speichern vergessen haben.
- Sichtbarer Stand im Kopf der Seite: „Gespeichert 14:32" oder „Nicht gespeichert".
- Projektdatei: `projektNachJson()`, Download als
  `klassenkontakte-<slug>-<JJJJ-MM-TT>.json`.
- Laden: `<input type="file">`, `projektAusJson()`, dann **Bestätigung mit Zahlen**
  („Datei enthält 18 Familien, offen sind 4. Ersetzen?"). v1 **ersetzt**, es führt nicht
  zusammen: zwei Datensätze verschmelzen ist eine eigene Aufgabe und niemand braucht sie
  im ersten Jahr.
- **Kein File System Access API.** `docs/technik.md` stellt es in Aussicht; das ist
  hiermit überstimmt. Es gibt es nur in Chrome und Edge, und Download plus Datei-Auswahl
  funktioniert überall gleich. Sollte `technik.md` je überarbeitet werden, ist diese Zeile
  die neuere Entscheidung.

### Falle: `file://` hat einen anderen Speicher

Die spätere Einzeldatei für den Offline-Gebrauch läuft unter `file://` und bekommt damit
einen **anderen Origin als die gehostete Seite — also einen anderen IndexedDB-Speicher.**
Wer zwischen beiden wechselt, sieht zwei verschiedene Datensätze und hält den einen für
verloren.

Darum: im Kopf der Seite immer anzeigen, woher sie geladen wurde („Online-Version" oder
„Offline-Datei"), und beim ersten Start der Offline-Datei einmal erklären, dass die Daten
getrennt sind. Die Projektdatei ist der Weg zwischen beiden.

## Bildschirme

**Erster Start, kein Projekt.** Kurz erklären, was das Werkzeug ist und dass die Daten
das Gerät nicht verlassen. Dann: Klasse wählen (Liste aus `site.config.json`, über
`<meta>` eingebacken, `parseClassName()` für Anzeige und Slug), Namen der Delegierten
optional. Alternativ „Projektdatei laden".

**Hauptbildschirm.** Kopf: Klasse, Schuljahr, Speicherstand, Herkunft der Seite. Dann
eine Liste **gruppiert nach Kind** — der Gruppierungsschlüssel ist überall das Kind, nicht
der Haushalt. Pro Kind die Bezugspersonen mit Rolle, E-Mail, Nummer, Adresse falls
vorhanden, und zwei Zustandszeichen für Liste und WhatsApp-Gruppe mit drei möglichen
Werten: ja, nein, **unbekannt**. „Unbekannt" muss sich sichtbar von „nein" unterscheiden;
es ist der Grund, warum es dieses Werkzeug gibt.

Zähler oben: „14 von 22 Familien · 11 in der Klassenliste · 3 ohne Einwilligung".

**Papierformular tippen.** Dasselbe Formular wie `/f/`, aber lokal gespeichert statt
gesendet. Erreichbar über „Familie von Hand erfassen". Tastaturfreundlich: Tab von Feld
zu Feld, Enter speichert und öffnet ein leeres Formular, weil eine Delegierte am Küchentisch
zwanzig Zettel hintereinander abtippt.

**Einwilligung ändern.** Direkt in der Liste umschaltbar, mit Datum der Änderung im
Protokoll. Ein Widerruf per Telefon muss in zehn Sekunden erfasst sein.

**Löschen.** Einzelne Person (`personLoeschen()`, räumt verwaiste Kinder mit auf) und
„alles löschen" mit Eingabe des Klassennamens zur Bestätigung.

## Zu benutzende Funktionen

Alles aus `src/core/`. Nichts davon nachbauen, und **nicht erneut normalisieren**:
`einreichungAufnehmen()` erledigt das beim Hineinnehmen, damit keine Ausgabe je rohe
Eingaben sieht.

| Funktion | Modul | wofür |
|---|---|---|
| `decodeSubmission` | payload.js | Link entpacken, wirft nie |
| `readableSummary` | payload.js | Bestätigungsschritt |
| `neuesProjekt`, `einreichungAufnehmen` | model.js | Projekt und Aufnahme |
| `personenFuerKind` | model.js | Gruppierung nach Kind |
| `fuerKlassenliste`, `fuerWhatsapp`, `einwilligungOffen` | model.js | Zähler und Filter |
| `fehlendeKinder` | model.js | Nachfassliste (braucht Klassenliste als Eingabe) |
| `projektNachJson`, `projektAusJson`, `personLoeschen` | model.js | Datei und Löschen |
| `parseClassName`, `compareClasses` | classname.js | Klassenwahl, Sortierung |

## Abnahmeprüfungen

Eine frische Umsetzung gilt als fertig, wenn das hier von Hand nachvollziehbar ist:

1. Formular unter `/f/3a/` ausfüllen, „Per E-Mail senden", den Link aus der Nachricht in
   `/w/` öffnen → Bestätigungsschritt zeigt genau diese Familie.
2. Nach dem Übernehmen ist `location.hash` **leer**, und die Zurück-Taste bringt die
   Nutzlast nicht wieder.
3. Zweite Einreichung derselben Familie mit geänderter Nummer → `ergaenzt`, die Änderung
   wird vor dem Übernehmen im Klartext angezeigt, keine Dublette.
4. Zweite Einreichung, die nur eine von zwei Personen nennt → die andere Person bleibt
   unangetastet.
5. Seite neu laden → alles noch da, ohne dass jemand gespeichert hat.
6. Projektdatei herunterladen, „alles löschen", Datei laden → identischer Stand.
7. Kaputten Link öffnen (`#d=quatsch`) → verständliche Meldung, keine leere Seite.
8. Einreichung aus `/f/3a/` bei offenem KiGa-1-Projekt → Warnung, kein stilles Übernehmen.
9. Familie ohne Einwilligung erfassen → erscheint als **unbekannt**, nicht als „nein", und
   wird von `fuerKlassenliste()` nicht mitgezählt.
10. Im Browser prüfen: kein `connect-src` in der CSP, und in der Netzwerkkonsole nach dem
    Erfassen von Daten keine ausgehende Anfrage.
