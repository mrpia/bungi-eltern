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
function fillDefaults(text, values) {
  return text.replace(
    /<(span|div)([^>]*?)data-field="([a-z]+)"([^>]*?)><\/\1>/g,
    (whole, tag, pre, field, post) =>
      values[field] === undefined ? whole : `<${tag}${pre}data-field="${field}"${post}>${values[field]}</${tag}>`,
  );
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
function setMeta(text, name, value) {
  const tag = new RegExp(`(<meta name="kk-${name}" content=")[^"]*(">)`);
  if (!tag.test(text)) throw new Error(`no <meta name="kk-${name}"> in the template to fill`);
  const safe = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return text.replace(tag, (whole, open, close) => `${open}${safe}${close}`);
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

/** Read a source directory into the asset registry; anything not code is copied verbatim. */
async function stage(fromRel, toRel) {
  for (const file of await readdir(join(SRC, fromRel))) {
    if (file.startsWith('_')) continue;                   // dev-only helpers stay out
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
<body>
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
const siteValues = {
  schule: cfg.school,
  jahr: cfg.schoolYear,
  kontakt: cfg.contact,
  version: cfg.noticeVersion,
};
const prepare = (text) => linkAssets(fillDefaults(absolutise(text), siteValues));

await copyDir('kit', 'kit', prepare, ['notice.html']);
await write('merkblatt/index.html', prepare(await readFile(join(SRC, 'kit/notice.html'), 'utf8')));

// Not written yet. A stub rather than a 404, so the domain and the certificate can go
// live now and the printed URLs are never dead.
await write('start/index.html', stub('Start für Klassendelegierte', 'für neu gewählte Klassendelegierte'));

// The parent form: one page per class. The class is written into <meta> tags rather than a
// query string, so the page needs no inline script and its CSP can stay script-src 'self'.
// Only the shared assets go to /assets/f/; index.html is a template, not a served page.
const formTemplate = linkAssets(await readFile(join(SRC, 'f/index.html'), 'utf8'));
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
let workbench = linkAssets(await readFile(join(SRC, 'w/index.html'), 'utf8'));
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

const count = (await readdir(OUT, { recursive: true })).length;
console.log(`site/ built: ${count} entries, ${classes.length} classes`);
console.log('classes in order:', classes.map((c) => c.parsed.display).join(', '));
