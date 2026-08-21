// Assembles the deployable site from src/.
//
// Why a build step at all, when everything is static: pages live at several nesting
// depths (/start/, /f/3a/, /kit/) and all need the same shared modules. Relative imports
// across depths are a reliable source of 404s, so the build rewrites them to absolute
// /assets/... paths. That works because the site owns its own subdomain root.
//
// No dependencies, no bundler, no minifier. Copy and rewrite, that is all.

import { readFile, writeFile, mkdir, rm, readdir, copyFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { parseClassName, compareClasses } from '../src/core/classname.js';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'site');

const cfg = JSON.parse(await readFile(join(ROOT, 'site.config.json'), 'utf8'));

/**
 * Bake the site-wide values into the markup at build time.
 *
 * The sheets fill their placeholders from URL parameters at runtime, which is right for
 * per-class values like the class name. It is wrong for the notice: `/merkblatt/` is a
 * standalone document, a consent record points at it by version, and people archive and
 * print it. With JavaScript off, an empty contact span means the one document that tells a
 * parent how to withdraw consent does not say who to write to.
 *
 * So anything that comes from site.config.json is substituted here. Runtime parameters
 * still override, they just no longer have to be present.
 */
/** Which site-wide fields actually reached a page, so the build can notice when one does not. */
const filledFields = new Set();

function fillDefaults(text, values) {
  // `[^<]*` rather than nothing between the tags: this used to fill only *empty*
  // placeholders, so `<span data-field="version">2026-08-1</span>` in the two sheets was a
  // hardcoded literal that config could not reach. Bumping noticeVersion left both printed
  // sheets citing a version of the Merkblatt that no longer existed. Fields absent from
  // `values` — the per-class `class` and `count` — are still left alone.
  return text.replace(
    /<(span|div)([^>]*?)data-field="([a-z]+)"([^>]*?)>[^<]*<\/\1>/g,
    (whole, tag, pre, field, post) => {
      if (values[field] === undefined) return whole;
      filledFields.add(field);
      return `<${tag}${pre}data-field="${field}"${post}>${values[field]}</${tag}>`;
    },
  );
}

/**
 * Links whose target and visible text both come from site.config.json.
 *
 * Both sides in one substitution on purpose. The Merkblatt is printed and archived, and a
 * consent record points at it by version — a sheet of paper where the printed URL and the
 * link behind it disagree is a document that lies, and it cannot be corrected after the
 * print run. This is the same two-sides-of-a-boundary trap CLAUDE.md warns about, so the
 * two sides are never written separately.
 *
 * Source markup is `<a data-link="repo"></a>`, with no href of its own to drift.
 */
function fillLinks(text, values) {
  return text.replace(/<a([^>]*?)data-link="([a-z]+)"([^>]*?)><\/a>/g,
    (whole, pre, field, post) => {
      const url = values[field];
      if (url === undefined) return whole;
      if (/href=/.test(pre + post)) throw new Error(`data-link="${field}" already has an href`);
      // Shown without the scheme: it is read off paper and typed back in by hand.
      return `<a${pre}href="${escapeAttr(url)}"${post}>${url.replace(/^https?:\/\//, '')}</a>`;
    });
}

/**
 * Content hash appended to asset URLs, so a page never runs a stale script.
 *
 * HTML and JS are separately cached files. After a deploy a browser can hold the old
 * script and fetch the new page, and then the two disagree about element ids and field
 * names — a failure a delegate cannot diagnose and cannot fix by reloading. Hashing the
 * URL means new content is a new URL, so the pair can never come apart, and unchanged
 * assets stay cached.
 */
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 8);

/**
 * Set a `<meta name="kk-*">` value in a page template. Fails when the name is absent.
 *
 * This used to hand whole tags to String.replace, which returns its input unchanged when
 * the needle is not found. Once the meta names were translated from German to English the
 * calls stopped matching, and twelve of the thirteen parent forms went on announcing
 * "Klasse 3a" — with a green build and a passing test suite. A silent no-op is the wrong
 * primitive for a build invariant.
 */
const escapeAttr = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function setMeta(text, name, value) {
  const tag = new RegExp(`(<meta name="kk-${name}" content=")[^"]*(">)`);
  if (!tag.test(text)) throw new Error(`no <meta name="kk-${name}"> in the template to fill`);
  return text.replace(tag, (whole, open, close) => `${open}${escapeAttr(value)}${close}`);
}

// ---------------------------------------------------------------- work-in-progress notice

/**
 * A banner on every published page while the tool is being tried out on the live site.
 *
 * Set `wipNotice` to "" in site.config.json to remove it from every page at once. That is
 * the entire switch, deliberately: a temporary thing should be one edit to undo, not a
 * hunt through thirteen generated pages.
 *
 * Hidden in print. The Merkblatt and the two sheets are each measured to fill exactly one
 * A4, and a banner would push them onto a second page — and a parent scanning the QR code
 * on a printed sheet lands on a page that carries the notice anyway.
 *
 * The three pieces each carry their own `data-en`, in plain text, because the parent form
 * translates every `[data-en]` element it finds and markup inside that attribute would be
 * the only such case in the project. Pages without the toggle just ignore the attribute.
 */
const WIP_CSS = `
  .wip { background: #fff4d6; color: #6b4b00; border: 1px solid #d9a13c;
         border-radius: 8px; padding: .55rem .75rem; margin: 0 0 1.1rem;
         font: .85rem/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .wip strong { display: block; }
  .wip a { color: inherit; }
  @media (prefers-color-scheme: dark) {
    .wip { background: #2a2011; color: #f0b95c; border-color: #7a5c1e; }
  }
  @media print { .wip { display: none; } }`;

const wipBanner = () => (cfg.wipNotice
  ? '<div class="wip">'
    + '<strong data-en="Trial run — not in use yet">Testbetrieb — noch nicht in Gebrauch</strong>'
    + `<span data-en="${escapeAttr(cfg.wipNoticeEn)}">${cfg.wipNotice}</span> `
    + `<a href="mailto:${cfg.contact}">${cfg.contact}</a>`
    + '</div>'
  : '');

/**
 * @param {boolean} styled whether to carry the CSS inline. False for /f/ and /w/, whose
 *   `style-src 'self'` forbids an inline <style> block — their own stylesheets hold the
 *   rule instead, marked as temporary in both.
 */
function withWip(html, { styled }) {
  const banner = wipBanner();
  if (!banner) return html;
  if (!html.includes('<body>')) throw new Error('no <body> to put the notice after');
  return html.replace('<body>',
    `${styled ? `<style>${WIP_CSS}\n</style>\n` : ''}<body>\n${banner}`);
}

// ---------------------------------------------------------------- assets

// A module specifier in an import statement, in any of its three spellings:
// `from './x'`, `import './x'`, `import('./x')`.
const IMPORT = /\b(from|import)(\s*\(?\s*)(['"])([^'"]+)\3/g;

/**
 * Relative module specifiers become absolute /assets/ URLs, so nesting depth stops
 * mattering: pages live at /f/3a/, /kit/ and /w/ and all import the same core modules.
 *
 * @param {string|null} dir output directory under /assets/, for sibling `./x.js` imports.
 *   Null for HTML pages, which do not sit in /assets/ and where `./` means something else.
 */
const absolutise = (text, dir = null) => text.replace(IMPORT, (whole, keyword, gap, quote, spec) => {
  const rewritten = spec.startsWith('../') ? `/assets/${spec.slice(3)}`
    : dir && spec.startsWith('./') ? `/assets/${dir}/${spec.slice(2)}`
    : null;
  return rewritten ? `${keyword}${gap}${quote}${rewritten}${quote}` : whole;
});

const assets = new Map();     // URL → source, its own imports already absolutised
const hashes = new Map();     // URL → content hash
const emitted = new Map();    // URL → text as written, imports carrying their hashes

/**
 * Read a source directory into the asset registry; anything not code is copied verbatim.
 *
 * HTML is the exception, and skipping it is load-bearing rather than tidiness: `src/f/` and
 * `src/w/` hold a page *template* next to their assets, and copying it here published it at
 * `/assets/f/index.html` — a form still carrying the template's placeholder class, telling
 * whoever found it they were filling in Klasse 3a. /assets/ serves assets, never pages.
 */
async function stage(fromRel, toRel) {
  for (const file of await readdir(join(SRC, fromRel))) {
    if (file.startsWith('_')) continue;                   // dev-only helpers stay out
    if (file.endsWith('.html')) continue;                 // a page, built elsewhere
    const body = await readFile(join(SRC, fromRel, file), 'utf8');
    if (/\.(m?js|css)$/.test(file)) {
      assets.set(`/${toRel}/${file}`, absolutise(body, basename(toRel)));
    } else {
      await write(join(toRel, file), body);
    }
  }
}

/**
 * Hash an asset, bottom-up: its hash covers the hashed URLs of everything it imports.
 *
 * Without this the hash only reached one level. `/assets/f/form.js` carried a hash, but the
 * `/assets/core/payload.js` it imports did not, so a browser holding yesterday's payload
 * module would pair it with today's form and the wire format would disagree with itself.
 * Now a change to any core module changes the URL of every page asset above it.
 */
function hashOf(url, chain = []) {
  if (hashes.has(url)) return hashes.get(url);
  if (chain.includes(url)) throw new Error(`import cycle: ${[...chain, url].join(' → ')}`);
  const body = assets.get(url);
  if (body === undefined) {
    throw new Error(`${chain.at(-1) || 'a page'} imports ${url}, which the build does not emit`);
  }
  const text = body.replace(IMPORT, (whole, keyword, gap, quote, spec) =>
    (spec.startsWith('/assets/')
      ? `${keyword}${gap}${quote}${spec}?v=${hashOf(spec, [...chain, url])}${quote}`
      : whole));
  hashes.set(url, hash(text));
  emitted.set(url, text);
  return hashes.get(url);
}

/**
 * Point a page at the hashed URL of every asset it names. Throws on a reference the build
 * does not emit, because a 404 inside a built page is worth failing a deploy for.
 */
const linkAssets = (html) => html.replace(/\/assets\/[\w./-]+/g, (url) => {
  const h = hashes.get(url);
  if (!h) throw new Error(`a page references ${url}, which the build does not emit`);
  return `${url}?v=${h}`;
});

async function write(rel, text) {
  const path = join(OUT, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return rel;
}

async function copyDir(fromRel, toRel, transform, skip = []) {
  const files = await readdir(join(SRC, fromRel));
  const written = [];
  for (const f of files) {
    if (f.startsWith('_')) continue;                    // dev-only helpers stay out
    if (skip.includes(f)) continue;
    const body = await readFile(join(SRC, fromRel, f), 'utf8');
    written.push(await write(join(toRel, f), transform ? transform(body) : body));
  }
  return written;
}

// ---------------------------------------------------------------- templates

const shell = (title, body, extraHead = '') => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/favicon.svg">
<title>${title}</title>
<style>
  :root { --ink: #1a1a1a; --muted: #5a5a5a; --accent: #1f4e79; --panel: #f4f7fa; }
  @media (prefers-color-scheme: dark) {
    :root { --ink: #ececec; --muted: #a8a8a8; --accent: #7db3e8; --panel: #1c2431; }
    body { background: #12151a; }
  }
  * { box-sizing: border-box; }
  body { margin: 0 auto; max-width: 34rem; padding: 2rem 1.25rem 4rem; color: var(--ink);
         font: 16px/1.55 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  .head { color: var(--muted); font-size: .9rem; margin-bottom: 1.5rem;
          padding-bottom: .6rem; border-bottom: 2px solid var(--accent); }
  a { color: var(--accent); }
  ul { padding-left: 1.2rem; }
  li { margin-bottom: .4rem; }
  .box { background: var(--panel); border-radius: 8px; padding: 1rem 1.1rem; margin: 1.2rem 0; }
  .footer { color: var(--muted); font-size: .8rem; margin-top: 2.5rem; }
  code { font-family: Consolas, Menlo, monospace; font-size: .9em; }
</style>
${extraHead}
<style>${WIP_CSS}
</style>
<body>
${wipBanner()}
${body}
<p class="footer">Elternrat ${cfg.school} · Schuljahr ${cfg.schoolYear} ·
  <a href="/merkblatt/">Merkblatt</a> · ${cfg.contact}</p>
</body>`;

const stub = (title, wer) => shell(title, `<h1>${title}</h1>
<div class="head">Elternrat ${cfg.school}</div>
<div class="box">
  <strong>Diese Seite wird gerade gebaut.</strong>
  <p style="margin:.5rem 0 0">Sie ist ${wer} gedacht und in wenigen Tagen bereit.
  Wenn Sie hier gelandet sind und etwas brauchen, schreiben Sie an
  <a href="mailto:${cfg.contact}">${cfg.contact}</a>.</p>
</div>
<p>Bereits verfügbar: das <a href="/merkblatt/">Merkblatt zum Umgang mit Ihren
Kontaktangaben</a>.</p>`);

// ---------------------------------------------------------------- build

await rm(OUT, { recursive: true, force: true });

const classes = cfg.classes
  .map((c) => ({ ...c, parsed: parseClassName(c.name) }))
  .sort((a, b) => compareClasses(a.parsed, b.parsed));

const bad = classes.filter((c) => !c.parsed.ok);
if (bad.length) throw new Error(`unreadable class names: ${bad.map((c) => c.name).join(', ')}`);

// Host plumbing. .nojekyll matters: without it GitHub Pages hides files starting with _.
await write('CNAME', new URL(cfg.baseUrl).hostname + '\n');
await write('.nojekyll', '');
await write('robots.txt', 'User-agent: *\nDisallow: /\n');
await copyFile(join(SRC, 'site/favicon.svg'), join(OUT, 'favicon.svg'));

await stage('core', 'assets/core');
await stage('vendor', 'assets/vendor');
await stage('f', 'assets/f');
await stage('w', 'assets/w');
for (const url of [...assets.keys()]) hashOf(url);
for (const [url, text] of emitted) await write(url.slice(1), text);

// Printable sheets keep their own filenames; they are opened from the kit page.
// Per-class values (klasse, anzahl) stay dynamic; everything site-wide is baked in.
// Keys must match the `data-field` names in the markup. They were German here while the
// markup was renamed to English, so only `version` — the one word identical in both — ever
// matched. `school` and `year` looked fine because their hardcoded placeholders happened to
// equal the config, but `contact` is an empty span, and it rendered empty: the Merkblatt
// went out with no address to write to for withdrawing consent, exactly the failure the
// comment on fillDefaults describes. The check after the build now makes this impossible.
const siteValues = {
  school: cfg.school,
  year: cfg.schoolYear,
  contact: cfg.contact,
  version: cfg.noticeVersion,
};
const prepare = (text) => withWip(
  linkAssets(fillLinks(fillDefaults(absolutise(text), siteValues), { repo: cfg.repoUrl })),
  { styled: true });

await copyDir('kit', 'kit', prepare, ['notice.html']);
await write('merkblatt/index.html', prepare(await readFile(join(SRC, 'kit/notice.html'), 'utf8')));

// Not written yet. A stub rather than a 404, so the domain and the certificate can go
// live now and the printed URLs are never dead.
await write('start/index.html', stub('Start für Klassendelegierte', 'für neu gewählte Klassendelegierte'));

// The parent form: one page per class. The class is written into <meta> tags rather than a
// query string, so the page needs no inline script and its CSP can stay script-src 'self'.
// Only the shared assets go to /assets/f/; index.html is a template, not a served page.
const formTemplate = withWip(
  linkAssets(await readFile(join(SRC, 'f/index.html'), 'utf8')), { styled: false });
for (const c of classes) {
  let page = formTemplate;
  page = setMeta(page, 'class', c.parsed.display);
  page = setMeta(page, 'slug', c.parsed.slug);
  page = setMeta(page, 'year', cfg.schoolYear);
  page = setMeta(page, 'school', cfg.school);
  page = setMeta(page, 'notice', cfg.noticeVersion);
  page = setMeta(page, 'base', cfg.baseUrl);
  await write(`f/${c.parsed.slug}/index.html`, page);
}

// The workbench: one page, not one per class. The class comes from the project a delegate
// opened, not from the URL, so the whole class list is baked in for the picker.
// `name:count` per class, pipe-separated — readable in view-source and parsed in one line.
for (const c of classes) {
  if (/[|:]/.test(c.parsed.display)) throw new Error(`class name breaks the meta list: ${c.name}`);
}
let workbench = withWip(
  linkAssets(await readFile(join(SRC, 'w/index.html'), 'utf8')), { styled: false });
workbench = setMeta(workbench, 'year', cfg.schoolYear);
workbench = setMeta(workbench, 'school', cfg.school);
workbench = setMeta(workbench, 'notice', cfg.noticeVersion);
workbench = setMeta(workbench, 'base', cfg.baseUrl);
workbench = setMeta(workbench, 'classes',
  classes.map((c) => `${c.parsed.display}:${c.count}`).join('|'));
await write('w/index.html', workbench);

// Landing page.
await write('index.html', shell(`Elternrat ${cfg.school}`, `<h1>Elternrat ${cfg.school}</h1>
<div class="head">Kontaktangaben der Klasseneltern · Schuljahr ${cfg.schoolYear}</div>
<p>Diese Seite gehört dem Elternrat der ${cfg.school}. Sie hilft den Klassendelegierten,
die Kontaktangaben ihrer Klasseneltern zu sammeln — freiwillig, und nur mit
Einverständnis.</p>
<div class="box">
  <strong>Es liegen hier keine Daten.</strong>
  <p style="margin:.5rem 0 0">Die Angaben einer Klasse bleiben bei den Delegierten dieser
  Klasse. Diese Seite hat keine Datenbank und speichert nichts: alles läuft im Browser der
  Person, die sie benutzt. Details im <a href="/merkblatt/">Merkblatt</a>.</p>
</div>
<h2 style="font-size:1.05rem">Wohin?</h2>
<ul>
  <li><a href="/start/">Ich wurde als Delegierte oder Delegierter gewählt</a></li>
  <li><a href="/merkblatt/">Merkblatt: was mit meinen Angaben passiert</a></li>
</ul>
<p style="color:var(--muted);font-size:.9rem">Den Link zum Formular Ihrer Klasse erhalten
Sie von den Delegierten Ihrer Klasse, oder über den QR-Code auf dem Blatt vom
Elternabend.</p>`));

// Interim kit page: the batch generator will replace the link list with a print-all run.
await write('kit/index.html', shell('Kit: Blätter für den Elternabend', `<h1>Blätter für den Elternabend</h1>
<div class="head">Intern · Elternrat ${cfg.school} · ${classes.length} Klassen</div>
<p style="color:var(--muted);font-size:.9rem">Pro Klasse ein Lehrblatt und ein Elternblatt.
Öffnen, mit Strg/Cmd + P als PDF speichern, Skalierung 100 %.</p>
<table style="width:100%;border-collapse:collapse;font-size:.95rem">
<tr style="text-align:left"><th>Klasse</th><th>Lehrblatt</th><th>Elternblatt</th><th>Formular</th></tr>
${classes.map((c) => {
  const q = `class=${encodeURIComponent(c.parsed.display)}&year=${encodeURIComponent(cfg.schoolYear)}` +
            `&school=${encodeURIComponent(cfg.school)}&contact=${encodeURIComponent(cfg.contact)}` +
            `&version=${encodeURIComponent(cfg.noticeVersion)}&count=${c.count}` +
            `&base=${encodeURIComponent(cfg.baseUrl)}`;
  return `<tr style="border-top:1px solid #ccc"><td>${c.parsed.display}</td>` +
    `<td><a href="/kit/teacher-sheet.html?${q}">öffnen</a></td>` +
    `<td><a href="/kit/family-sheet.html?${q}">öffnen</a></td>` +
    `<td><a href="/f/${c.parsed.slug}/">/f/${c.parsed.slug}/</a></td></tr>`;
}).join('\n')}
</table>`));

// A value from site.config.json that reached no page at all is a name that no markup uses —
// which is what a rename across the German/English boundary looks like from here.
const unreached = Object.keys(siteValues).filter((field) => !filledFields.has(field));
if (unreached.length) {
  throw new Error(`site.config values reached no page: ${unreached.join(', ')} `
    + '— no markup has a matching data-field name');
}

const count = (await readdir(OUT, { recursive: true })).length;
console.log(`site/ built: ${count} entries, ${classes.length} classes`);
console.log('classes in order:', classes.map((c) => c.parsed.display).join(', '));
