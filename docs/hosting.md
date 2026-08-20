# Hosting

Static files on GitHub Pages, custom subdomain `bungi-eltern.mrpia.ch`.
No server, no database, nothing to patch.

## Why the repository is public

GitHub Pages only serves from a private repository on a paid plan. Public is also the
better choice here: the trust story of this tool is that a delegate can verify the page
sends their class's data nowhere, and the shortest path to verifying that is reading it.
There is no build step to see through and no bundle to unpick.

No personal data is ever in the repository. The class datasets live in the delegates'
browsers, and the repository holds only code, wording and the class list.

The draft letter to the school director is git-ignored. It is parents'-council
correspondence and does not belong next to public code — keep it in the Obsidian vault,
where it is private and backed up.

## Which GitHub account

The **personal** account `mrpia`, not the work-adjacent `mrpiaatwork`. A school
parents' council project should not hang off an account tied to employment, and the commit
identity is set per-repository to `pa.galiana@gmail.com` so the work address never appears
in a public history.

## One-time setup

1. **Authenticate the personal account.** Interactive, so it has to be run by hand:
   ```
   gh auth login --hostname github.com --git-protocol https --web
   gh auth switch --user mrpia
   ```
   Afterwards, switch back with `gh auth switch --user mrpiaatwork` so day-to-day work is
   unaffected.
2. **Create the repository and push:**
   ```
   gh repo create mrpia/bungi-eltern --public --source=. --push
   ```
3. **Point Pages at the workflow** rather than at a branch:
   ```
   gh api -X POST repos/mrpia/bungi-eltern/pages -f build_type=workflow
   ```
   Or in the web UI: Settings → Pages → Source → GitHub Actions.
4. **Add the DNS record** at whoever hosts `mrpia.ch`:

   | Typ | Name | Wert | TTL |
   |---|---|---|---|
   | CNAME | `bungi-eltern` | `mrpia.github.io.` | 3600 |

   A subdomain takes a CNAME. Do not use an A record — those are only needed for an apex
   domain, and they pin you to GitHub's current IP addresses.
5. **Wait, then enable HTTPS.** Settings → Pages → Enforce HTTPS. The checkbox stays greyed
   out until GitHub has seen the DNS record and issued a Let's Encrypt certificate. That
   usually takes minutes but is documented as up to 24 hours.

Step 5 is the reason to do all of this now rather than in September: certificate issuance
is the one part nobody can hurry, and a printed QR code pointing at a certificate warning
is worse than one pointing at a plain page.

## Deployment

Push to `main`. The workflow runs the tests, builds `site/`, and publishes. A failing test
blocks the deploy, which is deliberate: `test/qr.test.js` asserts the printed QR codes stay
scannable, so a change that would produce unreadable codes cannot reach the sheets.

## Routes

| URL | Was | Stand |
|---|---|---|
| `/` | Landing page, explains that no data lives here | fertig |
| `/merkblatt/` | Full information notice, linked from every sheet | fertig |
| `/kit/` | Internal: per-class links to the printable sheets | interim |
| `/kit/blatt.html`, `/kit/lehrblatt.html` | The printable sheets | fertig |
| `/start/` | Delegate self-setup, 60 seconds on a phone | Platzhalter |
| `/f/<klasse>/` | Parent form, one per class (`/f/3a/`, `/f/kiga1/`) | Platzhalter |
| `/w/` | Delegate workbench | Platzhalter |

The placeholders are deliberate. They say the page is being built and give a contact
address, so the domain and the certificate can go live now while the pages are written,
and no printed URL is ever a 404.

## Class list

`site.config.json` drives the build: school, school year, base URL, contact, notice
version, and the 13 classes. The class list in there is **a guess** and needs confirming —
which years are split a/b changes annually. A name the parser cannot read fails the build
rather than producing a wrong slug.

## robots.txt

`Disallow: /` for everything. The site is public because it has to be, not because it
should be found. Every page also carries `noindex, nofollow`.
