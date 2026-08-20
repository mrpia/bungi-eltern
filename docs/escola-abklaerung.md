# Escola: was die Schule schon kann (Recherche 2026-08-20)

Quellen: siehe unten. Alles aus dem öffentlichen Escola-Support-Portal, nichts getestet —
die konkrete Konfiguration eurer Schule kann abweichen.

## Befund 1: Eltern können heute schon andere Eltern der eigenen Klasse anschreiben

Im Rechtemodell des Messengers dürfen Eltern *Einzelpersonen* kontaktieren:
Administration, Lehrpersonen, Schulleitung, das Personal der Klasse ihres Kindes,
**andere Eltern der Klasse ihres Kindes**, und Personen, die als "für alle kontaktierbar"
markiert sind. Kein Gruppenwähler.

→ Eine Delegierte kann heute jede Familie ihrer Klasse erreichen, ohne eine einzige
   Kontaktangabe zu besitzen. Nur eben einzeln, was bei 22 Familien niemand macht.

## Befund 2: Der Gruppenwähler ist ein Schalter, kein Umbau

Zitat Support: "Falls Personen, welche ... derzeit keinen Zugriff auf den Gruppenwähler
haben, kann dieser für sie freigeschaltet werden" — pro Person unter
`Messenger > Einstellungen`, oder für ganze Personengruppen unter
`Personen > Personengruppen definieren`. Personengruppen wie Behörden oder Elternrat
sind ausdrücklich erwähnt.

→ Ein Admin-Schalter, und die Delegierten schreiben ihrer Klasse mit wenigen Klicks.

## Befund 3: Die Versandoptionen sind besser als WhatsApp

Beim Versand wählbar:
- `Broadcast` — Empfänger:innen können nicht antworten
- `Empfänger verbergen` — Empfänger sehen nicht, wer sonst empfangen hat, kein Reply-All
- `Vertraulicher Inhalt` — Inhalt nur nach Login lesbar, nicht in Push/E-Mail-Kopie
- `Lesebestätigung` — Empfänger bestätigen aktiv

→ Protokolle des Elternrats gehen an die ganze Klasse, ohne dass eine einzige
   Adresse offengelegt wird, und die Delegierte sieht, wer gelesen hat.
   Das ist für Zweck 1 sauberer als jede WhatsApp-Gruppe.

## Befund 4: Der Messenger hat Umfragen mit Excel-Export

Bausteine `Freitext`, `Frage` (freie Antwort), `Auswahl` (vorgegebene Antworten).
Ergebnisse unter `Messenger > Umfragen`, "besteht auch die Möglichkeit, sich die
Ergebnisse im Excel-Format zu exportieren". Einschränkung: "können nur mit Personen
geteilt werden, die auf Escola erfasst sind."

→ Die Einsammlung der Kontaktdaten könnte über eine Klassenumfrage laufen,
   Export als Excel, Import ins Werkzeug. Kein privates Google-Formular nötig.

## Was Escola NICHT lösen kann

Zweck 2. Eine Klassenliste, die die Eltern selber in der Hand haben, und eine
WhatsApp-Gruppe sind per Definition Daten, die das System der Schule verlassen.
Dafür braucht es das Werkzeug, unabhängig davon, wie freundlich die Schulleitung ist.

## Konsequenz für den Projektumfang

- Gelingt Befund 2, braucht Zweck 1 **null** Kontaktdaten. Der Datensatz schrumpft auf
  die Familien, die freiwillig eine Klassenliste wollen. Das ist die grösste
  Datenschutz- und Aufwandsreduktion, die überhaupt zu holen ist.
- Gelingt Befund 4, ist auch der Einsammelkanal gelöst, und das Werkzeug ist reine
  Verarbeitung: Excel rein, Liste und Kontaktkarten raus.
- Der Importer wird darum generisch gebaut (Spalten-Mapping im UI), nicht auf ein
  Format festgenagelt. Escola-Export, CSV, Zettel-Erfassung, QR — dieselbe Pipeline.

## Vorbehalt, ehrlich benannt

Läuft die Umfrage in Escola, liegen die Antworten im System der Schule. Formal geben
die Eltern sie freiwillig selber ein, die Schule teilt keine eigenen Daten. Die
Schulleitung kann das trotzdem anders sehen. Darum fragen, nicht annehmen.
Und: es gibt immer Eltern, die Escola nicht aktiv nutzen. Zettel und QR bleiben nötig.

## Quellen

- Rechte im Messenger: https://support.escola.ch/support/solutions/articles/3000104807-wie-sind-die-rechte-im-messenger-vergeben-
- Standard-Einstellungen beim Versand: https://support.escola.ch/support/solutions/articles/3000129192-messenger-standard-einstellungen-beim-versand-einer-nachricht
- Umfragen im Messenger: https://support.escola.ch/support/solutions/articles/3000131904-umfragen-im-messenger
- Escola App, Funktionsübersicht: https://www.escola.ch/app
- Funktionen der App: https://support.escola.ch/support/solutions/articles/3000107245-welche-funktionen-umfasst-die-escola-app-
