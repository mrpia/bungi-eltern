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

Internal correspondence of the parents' council does not belong in this repository.
Drafts of letters to the school or the city are kept privately, outside the code.

## Which GitHub account

The **personal** account `mrpia`, not the work-adjacent `mrpiaatwork`. A school
parents' council project should not hang off an account tied to employment, and the commit
identity is set per-repository to `pa.galiana@gmail.com` so the work address never appears
in a public history.

## State as of 2026-08-20

Done: repository `mrpia/bungi-eltern` (public), first push, Pages set to
`build_type=workflow`, first deploy successful, custom domain `bungi-eltern.mrpia.ch`
registered, DNS CNAME added and resolving, site live over HTTP.
`https://mrpia.github.io/bungi-eltern/` answers with a 301 to the custom domain, which
confirms the absolute asset paths are correct for the real target.

HTTPS is live: Let's Encrypt certificate for `bungi-eltern.mrpia.ch`, issued
2026-08-20 11:46 UTC, `https_enforced` set to `true`. All routes answer over HTTPS.

## The ordering trap that cost two hours

**Do not set the custom domain before the DNS record resolves.**

The custom domain was registered via the API while `bungi-eltern.mrpia.ch` did not yet
resolve. GitHub attempted verification, failed against a hostname that did not exist, and
**never retried**. DNS was then correct for two hours with nothing happening, while
`/pages/health` cheerfully reported `is_https_eligible: true` and `caa_error: null` — the
configuration really was fine, the request had simply died and nobody was going to reissue it.

The remedy is to re-assert the domain so a fresh request runs against working DNS:

```
gh api -X PUT repos/OWNER/REPO/pages -f cname=""                      # remove
gh api -X PUT repos/OWNER/REPO/pages -f cname=host.example.ch         # add back
```

The certificate arrived about one minute later. The site never went down during the gap,
because the `CNAME` file in the deployed artifact keeps serving the domain while the
API-level setting is empty.

Two further details worth knowing:

- `/pages/health` **caches**. It still reported `peer_failed_verification` after the
  certificate was live. The live TLS handshake is the ground truth:
  `echo | openssl s_client -servername HOST -connect HOST:443 | openssl x509 -noout -subject`
- `https_enforced` needs a **typed boolean**. `gh api -f https_enforced=true` sends a string
  and returns 422; use `-F https_enforced=true`.
- The HTTP-to-HTTPS redirect appears at GitHub's edge on its own schedule, some minutes
  later. It is not load-bearing here: every printed link and QR code encodes `https://`
  directly.

## One-time setup

1. **Authenticate the personal account.** Interactive, so it has to be run by hand:
   ```
   gh auth login --hostname github.com --git-protocol https --web
   gh auth switch --user mrpia
   ```
   Afterwards, switch back with `gh auth switch --user mrpiaatwork` so day-to-day work is
   unaffected. **Push as `mrpia` before switching back** — git credentials follow the
   active account, so a push made after switching gets a 403.

   The freshly authenticated account will lack the `workflow` scope, and GitHub refuses to
   let a token without it push anything under `.github/workflows/`. Add it once:
   ```
   gh auth refresh -h github.com -s workflow
   ```
   `gh auth switch` does not change scopes, only which account is active.
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

| URL | What | State |
|---|---|---|
| `/` | Landing page, explains that no data lives here | done |
| `/merkblatt/` | Full information notice, linked from every sheet | done |
| `/kit/` | Internal: per-class links to the printable sheets | interim |
| `/kit/blatt.html`, `/kit/lehrblatt.html` | The printable sheets | done |
| `/start/` | Delegate self-setup, 60 seconds on a phone | placeholder |
| `/f/<class>/` | Parent form, one per class (`/f/3a/`, `/f/kiga1/`) | done |
| `/w/` | Delegate workbench | placeholder |

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
