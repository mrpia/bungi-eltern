# Klassenkontakte — working rules

Read this before writing anything. For everything else, start at
[`docs/todo.md`](docs/todo.md), which says what is left to build and carries the other
project invariants.

## GitHub account

This project lives on the **personal** account `mrpia` — repository
`mrpia/bungi-eltern`, commits authored as `pa.galiana@gmail.com`. **Never** the
work-adjacent `mrpiaatwork`, and never the work email.

A school parents' council project should not hang off an account tied to employment, and a
public repository stamps the commit address into a permanent history that cannot be tidied
up afterwards.

The repo-local git identity is already set, so it overrides the global config. Check both
before committing or pushing:

```
git config user.email      # must print pa.galiana@gmail.com
gh api user --jq .login    # must print mrpia
```

If the active account is wrong: `gh auth switch --user mrpia`. Git credentials follow the
*active* gh account, so **push before switching away**, or the push fails with a 403.
That trap and the missing `workflow` scope are written up in
[`docs/hosting.md`](docs/hosting.md).

## The language rule

**English for everything a developer reads. German for everything a parent or a delegate
reads.**

That boundary is not about files, it is about who the words are for. The same file usually
contains both: `src/f/formular.js` has English identifiers and German UI strings, and that
is correct.

### English

| | Examples |
|---|---|
| Code identifiers | `ingestSubmission`, `caregiversForChild`, `findChild` |
| Comments and commit messages | including the reasoning, not just the what |
| Documentation and specs | everything under `docs/` |
| Data field names | `firstName`, `classLabel`, `consent.classList` |
| The payload wire format | the JSON keys inside `#d=` |
| Config keys | `school`, `schoolYear`, `baseUrl`, `classes` |
| HTML `data-*` attributes and their values | `data-field="school"`, `data-role="firstName"` |
| Element ids | `#child-first-name`, `#consent-list`, `#review` |
| CSS class names and custom properties | `.hidden`, `.review-title`, `--accent` |
| Error and status codes | `'version-mismatch'`, `'email-typo'`, `'legacy'` |
| Result values | `'new'`, `'updated'`, `'unchanged'` |
| Build output and test names | `site/ built: 61 entries` |
| Source filenames | `workbench.js`, not `werkstatt.js` |

### German

| | Examples |
|---|---|
| Web page copy | the landing page, the parent form, `/merkblatt/` |
| Printed sheets | family sheet, teacher sheet, information notice |
| Every UI string | labels, buttons, validation messages |
| The readable block a parent sends | `readableSummary()` output |
| Change descriptions shown before an import | `Klassenliste: ja → nein` |
| Notes shown to a delegate | `Nummer nicht lesbar: 12345` |
| Data *values* | `"Klasse 3a"`, `"Mutter"`, `"Schule Bungertwies"` |

The parent form additionally offers English via a toggle. Nothing else is translated.

Swiss usage: **`ss`, never `ß`.**

## Anything a person reads that the API returns

Return **both**: an English code to branch on, and a German sentence to display.

```js
return { ok: false, code: 'version-mismatch', text: `Unbekannte Dateiversion ${p.v}.` };
```

The caller can switch on `code` or just show `text`. All German wording then lives in the
module that produces it, in one place, instead of in a translation table that drifts.

## Names that stay German

Proper nouns and the names of real things. Gloss them in English on first use in a document,
then use them plainly:

**Elternrat** (parents' council) · **Klassendelegierte** (class delegates) ·
**Elternabend** (class parents' evening) · **Merkblatt** (information notice) ·
**Klassenzug** (a class that stays together for several years) · **KiGa** (kindergarten) ·
**Escola** (the school's platform) · class labels like `Klasse 3a` and `KiGa 1` ·
**Schule Bungertwies**

**Klassenkontakte** is the product's own name, so it stays German wherever a name is wanted:
the npm package name, the IndexedDB database, `dist/klassenkontakte.html`, and the
`klassenkontakte-3a-2026-09-15.json` download. Do not translate it, and do not invent a
second name for the same thing.

`KIGA` and `KLASSE` in `src/core/classname.js` keep their names: they are regexes that match
those literal German words, and renaming them would obscure what they do.

## Public URLs vs source filenames

These pull in opposite directions, so the ruling is explicit:

- **Public URLs stay German**, because parents read them and 290 printed sheets carry them.
  `/merkblatt/` is printed on paper and cannot be renamed without a reprint.
- **Source filenames are English.** `src/kit/notice.html` builds to
  `site/merkblatt/index.html`; the mapping lives in `tools/build.mjs`.

Current pairs:

| Source | Public URL |
|---|---|
| `src/kit/notice.html` | `/merkblatt/` |
| `src/kit/family-sheet.html` | `/kit/family-sheet.html` (internal, president only) |
| `src/kit/teacher-sheet.html` | `/kit/teacher-sheet.html` (internal) |
| `src/f/index.html` | `/f/<class>/` |

And do not serve one document at two URLs. The notice used to appear at both `/merkblatt/`
and `/kit/merkblatt.html`; that is two cached copies of the same text that can disagree
about which version of the Merkblatt a consent record points at.

## What the rule does not cover

Commit history before 2026-08-20 contains German commit messages, written before this rule
existed. Leave them. They are a record, and rewriting history to tidy prose is not worth it.

## When renaming across the language boundary

Learned the hard way, three times in one session. **Blind search-and-replace will break
things that neither grep nor the unit tests notice**, because the failures are a string on
one side of a boundary and a matching string on the other:

- a stylesheet selector and a `class` attribute
- a `getElementById` call and an `id`
- a `data-role` lookup and the attribute value in the markup
- a `<meta>` name the build writes and the name the script reads
- a sheet's script keys and its own `data-field` attributes

Rename in **syntactic context**, not globally — and then **drive the actual page in a
browser**. `npm test` passing is not evidence that a rename worked.
