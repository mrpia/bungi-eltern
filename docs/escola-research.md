# Escola: what the school can already do (research 2026-08-20)

Sources at the bottom. Everything here comes from the public Escola support portal, nothing
was tested — the actual configuration at this school may differ.

Escola is the school's parent-communication platform. Its messaging feature appears in the
app as *Nachrichten* and in the support documentation as *Messenger*.

## Finding 1: parents can already write to other parents of their own class

In the messenger permission model, parents may contact *individuals*: administration,
teachers, school leadership, the staff of their child's class, **other parents of their
child's class**, and people flagged as contactable by everyone. No group selector
(Gruppenwähler).

→ A delegate can already reach every family in their class today, without holding a single
  contact detail. Only one at a time, which is why nobody does it for 22 families.

## Finding 2: the group selector is a switch, not a rebuild

Support quote: *"Falls Personen, welche ... derzeit keinen Zugriff auf den Gruppenwähler
haben, kann dieser für sie freigeschaltet werden"* — per person under
`Messenger > Einstellungen`, or for entire person groups under
`Personen > Personengruppen definieren`. Person groups such as authorities or the Elternrat
are named explicitly.

→ One admin switch, and delegates write to their whole class in a few clicks.

## Finding 3: the send options are better than WhatsApp

Selectable when sending:

- `Broadcast` — recipients cannot reply
- `Empfänger verbergen` (hide recipients) — recipients cannot see who else received it, no
  reply-all
- `Vertraulicher Inhalt` (confidential content) — readable only after login, not in push
  notifications or email copies
- `Lesebestätigung` (read receipt) — recipients confirm actively

→ Council minutes reach the whole class without a single address being disclosed, and the
  delegate can see who has read them. For Purpose 1 that is cleaner than any WhatsApp group.

## Finding 4: the messenger has surveys with Excel export

Building blocks: free text, open question, multiple choice. Results under
`Messenger > Umfragen`, and *"besteht auch die Möglichkeit, sich die Ergebnisse im
Excel-Format zu exportieren"*. Limitation: *"können nur mit Personen geteilt werden, die auf
Escola erfasst sind"* — only people registered in Escola.

→ Collecting the contact details could run as a class survey, exported to Excel and imported
  into the workbench. No private Google form needed.

## What Escola cannot solve

Purpose 2. A class list that parents hold themselves, and a WhatsApp group, are by
definition data leaving the school's system. That needs the tool, however helpful the school
leadership turns out to be.

## Consequences for scope

- If finding 2 lands, Purpose 1 needs **no** contact data at all. The dataset shrinks to the
  families who actively want a class list. That is the largest reduction in both privacy
  exposure and effort available anywhere in this project.
- If finding 4 lands, the collection channel is solved too, and the tool becomes pure
  processing: Excel in, list and contact cards out.
- The importer is therefore built generically, with column mapping in the UI, rather than
  pinned to one format. Escola export, CSV, typed-in paper, QR — one pipeline.

## Reservation, stated honestly

If the survey runs inside Escola, the answers sit in the school's system. Formally the
parents enter them voluntarily and the school shares no data of its own. School leadership
may still see it differently. So ask, do not assume.

And there are always parents who do not actively use Escola. Paper and QR remain necessary.

## Sources

- Messenger permissions: https://support.escola.ch/support/solutions/articles/3000104807-wie-sind-die-rechte-im-messenger-vergeben-
- Default send options: https://support.escola.ch/support/solutions/articles/3000129192-messenger-standard-einstellungen-beim-versand-einer-nachricht
- Surveys in the messenger: https://support.escola.ch/support/solutions/articles/3000131904-umfragen-im-messenger
- Escola app, feature overview: https://www.escola.ch/app
- App features: https://support.escola.ch/support/solutions/articles/3000107245-welche-funktionen-umfasst-die-escola-app-
