// Assembles the deployable site from src/.
//
// Why a build step at all, when everything is static: pages live at several nesting
// depths (/start/, /f/3a/, /kit/) and all need the same shared modules. Relative imports
// across depths are a reliable source of 404s, so the build rewrites them to absolute
// /assets/... paths. That works because the site owns its own subdomain root.
//
// No dependencies, no bundler, no minifier. Copy and rewrite, that is all.

import { readFile, writeFile, mkdir, rm, readdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
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
function fillDefaults(text, werte) {
  return text.replace(
    /<(span|div)([^>]*?)data-feld="([a-z]+)"([^>]*?)><\/\1>/g,
    (whole, tag, pre, feld, post) =>
      werte[feld] === undefined ? whole : `<${tag}${pre}data-feld="${feld}"${post}>${werte[feld]}</${tag}>`,
  );
}

/** Relative module imports become absolute, so nesting depth stops mattering. */
const absolutise = (text) =>
  text.replace(/(['"])\.\.\/core\//g, '$1/assets/core/')
      .replace(/(['"])\.\.\/vendor\//g, '$1/assets/vendor/');

async function write(rel, text) {
  const path = join(OUT, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return rel;
}

async function copyDir(fromRel, toRel, transform) {
  const files = await readdir(join(SRC, fromRel));
  const written = [];
  for (const f of files) {
    if (f.startsWith('_')) continue;                    // dev-only helpers stay out
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
  :root { --ink: #1a1a1a; --muted: #5a5a5a; --accent: #1f4e79; --flaeche: #f4f7fa; }
  @media (prefers-color-scheme: dark) {
    :root { --ink: #ececec; --muted: #a8a8a8; --accent: #7db3e8; --flaeche: #1c2431; }
    body { background: #12151a; }
  }
  * { box-sizing: border-box; }
  body { margin: 0 auto; max-width: 34rem; padding: 2rem 1.25rem 4rem; color: var(--ink);
         font: 16px/1.55 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  .kopf { color: var(--muted); font-size: .9rem; margin-bottom: 1.5rem;
          padding-bottom: .6rem; border-bottom: 2px solid var(--accent); }
  a { color: var(--accent); }
  ul { padding-left: 1.2rem; }
  li { margin-bottom: .4rem; }
  .kasten { background: var(--flaeche); border-radius: 8px; padding: 1rem 1.1rem; margin: 1.2rem 0; }
  .fuss { color: var(--muted); font-size: .8rem; margin-top: 2.5rem; }
  code { font-family: Consolas, Menlo, monospace; font-size: .9em; }
</style>
${extraHead}
<body>
${body}
<p class="fuss">Elternrat ${cfg.schule} · Schuljahr ${cfg.schuljahr} ·
  <a href="/merkblatt/">Merkblatt</a> · ${cfg.kontakt}</p>
</body>`;

const stub = (title, wer) => shell(title, `<h1>${title}</h1>
<div class="kopf">Elternrat ${cfg.schule}</div>
<div class="kasten">
  <strong>Diese Seite wird gerade gebaut.</strong>
  <p style="margin:.5rem 0 0">Sie ist ${wer} gedacht und in wenigen Tagen bereit.
  Wenn Sie hier gelandet sind und etwas brauchen, schreiben Sie an
  <a href="mailto:${cfg.kontakt}">${cfg.kontakt}</a>.</p>
</div>
<p>Bereits verfügbar: das <a href="/merkblatt/">Merkblatt zum Umgang mit Ihren
Kontaktangaben</a>.</p>`);

// ---------------------------------------------------------------- build

await rm(OUT, { recursive: true, force: true });

const klassen = cfg.klassen
  .map((k) => ({ ...k, parsed: parseClassName(k.name) }))
  .sort((a, b) => compareClasses(a.parsed, b.parsed));

const bad = klassen.filter((k) => !k.parsed.ok);
if (bad.length) throw new Error(`Unlesbare Klassennamen: ${bad.map((k) => k.name).join(', ')}`);

// Host plumbing. .nojekyll matters: without it GitHub Pages hides files starting with _.
await write('CNAME', new URL(cfg.basis).hostname + '\n');
await write('.nojekyll', '');
await write('robots.txt', 'User-agent: *\nDisallow: /\n');
await copyFile(join(SRC, 'site/favicon.svg'), join(OUT, 'favicon.svg'));

await copyDir('core', 'assets/core', absolutise);
await copyDir('vendor', 'assets/vendor');

// Printable sheets keep their own filenames; they are opened from the kit page.
// Per-class values (klasse, anzahl) stay dynamic; everything site-wide is baked in.
const seitenWerte = {
  schule: cfg.schule,
  jahr: cfg.schuljahr,
  kontakt: cfg.kontakt,
  version: cfg.merkblattVersion,
};
const vorbereiten = (text) => fillDefaults(absolutise(text), seitenWerte);

await copyDir('kit', 'kit', vorbereiten);
await write('merkblatt/index.html', vorbereiten(await readFile(join(SRC, 'kit/merkblatt.html'), 'utf8')));

// Pages not written yet. Stubs rather than 404s, so the domain and the certificate can
// go live now and the printed URLs are never dead.
await write('start/index.html', stub('Start für Klassendelegierte', 'für neu gewählte Klassendelegierte'));
await write('w/index.html', stub('Werkstatt', 'für die Klassendelegierten zum Erfassen der Angaben'));
for (const k of klassen) {
  await write(`f/${k.parsed.slug}/index.html`,
    stub(`Kontaktangaben ${k.parsed.display}`, `für die Eltern der ${k.parsed.display}`));
}

// Landing page.
await write('index.html', shell(`Elternrat ${cfg.schule}`, `<h1>Elternrat ${cfg.schule}</h1>
<div class="kopf">Kontaktangaben der Klasseneltern · Schuljahr ${cfg.schuljahr}</div>
<p>Diese Seite gehört dem Elternrat der ${cfg.schule}. Sie hilft den Klassendelegierten,
die Kontaktangaben ihrer Klasseneltern zu sammeln — freiwillig, und nur mit
Einverständnis.</p>
<div class="kasten">
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
<div class="kopf">Intern · Elternrat ${cfg.schule} · ${klassen.length} Klassen</div>
<p style="color:var(--muted);font-size:.9rem">Pro Klasse ein Lehrblatt und ein Elternblatt.
Öffnen, mit Strg/Cmd + P als PDF speichern, Skalierung 100 %.</p>
<table style="width:100%;border-collapse:collapse;font-size:.95rem">
<tr style="text-align:left"><th>Klasse</th><th>Lehrblatt</th><th>Elternblatt</th><th>Formular</th></tr>
${klassen.map((k) => {
  const q = `klasse=${encodeURIComponent(k.parsed.display)}&jahr=${encodeURIComponent(cfg.schuljahr)}` +
            `&schule=${encodeURIComponent(cfg.schule)}&kontakt=${encodeURIComponent(cfg.kontakt)}` +
            `&version=${encodeURIComponent(cfg.merkblattVersion)}&anzahl=${k.anzahl}` +
            `&basis=${encodeURIComponent(cfg.basis)}`;
  return `<tr style="border-top:1px solid #ccc"><td>${k.parsed.display}</td>` +
    `<td><a href="/kit/lehrblatt.html?${q}">öffnen</a></td>` +
    `<td><a href="/kit/blatt.html?${q}">öffnen</a></td>` +
    `<td><a href="/f/${k.parsed.slug}/">/f/${k.parsed.slug}/</a></td></tr>`;
}).join('\n')}
</table>`));

const count = (await readdir(OUT, { recursive: true })).length;
console.log(`site/ gebaut: ${count} Einträge, ${klassen.length} Klassen`);
console.log('Klassen in Reihenfolge:', klassen.map((k) => k.parsed.display).join(', '));
