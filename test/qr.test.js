import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrSvg, qrModules, qrVersion, qrPrintSize } from '../src/core/qr.js';

test('qr: module count follows the version formula', () => {
  // Version n has 4n + 17 modules per side. A short URL must stay small enough to print
  // at 18 mm and still scan.
  const url = 'https://bungi-eltern.mrpia.ch/f/3a';
  const v = qrVersion(url);
  assert.ok(Number.isInteger(v), `version should be whole, got ${v}`);
  assert.ok(v >= 1 && v <= 6, `expected a small version for a short URL, got ${v}`);
  assert.equal(qrModules(url).count, 4 * v + 17);
});

test('qr: umlauts encode without the UTF-8 override being forgotten', () => {
  // Same character count, but the umlaut costs two bytes. If the default Latin-1-ish
  // conversion were still installed, these would come out the same size.
  const plain = qrModules('Mueller Sophie, Klasse 3a, Beispielhausen 8000 ZH').count;
  const umlaut = qrModules('Müller Sophie, Klasse 3ä, Beispielhäusen 8000 ZH').count;
  assert.ok(umlaut >= plain, 'umlauts must cost at least as many bytes');
});

test('qr: svg is one path with a quiet zone and a scalable viewBox', () => {
  const svg = qrSvg('https://bungi-eltern.mrpia.ch/start', { title: 'Start' });
  const count = qrModules('https://bungi-eltern.mrpia.ch/start').count;
  assert.match(svg, new RegExp(`viewBox="0 0 ${count + 8} ${count + 8}"`)); // margin 4 each side
  assert.equal((svg.match(/<path /g) || []).length, 1);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /<title>Start<\/title>/);
  assert.match(svg, /fill="#fff"/); // white ground, so it works on a tinted box
});

test('qr: quiet zone is configurable but defaults to the spec minimum', () => {
  const c = qrModules('abc').count;
  assert.match(qrSvg('abc'), new RegExp(`viewBox="0 0 ${c + 8} ${c + 8}"`));
  assert.match(qrSvg('abc', { margin: 2 }), new RegExp(`viewBox="0 0 ${c + 4} ${c + 4}"`));
});

test('qr: title text is escaped, empty payload refused', () => {
  assert.match(qrSvg('x', { title: 'Klasse <3a> & co' }), /Klasse &lt;3a&gt; &amp; co/);
  assert.throws(() => qrModules(''), /empty payload/);
});

test('qr: a long deep-link payload still encodes, and reports its size', () => {
  // Worst case for the printed sheets is only a URL, but the parent form's deep link
  // carries a family record. This is the size guard for that path.
  const payload = 'https://bungi-eltern.mrpia.ch/w#d=' + 'A'.repeat(500);
  const v = qrVersion(payload);
  assert.ok(v > 6, `expected a dense code, got version ${v}`);
  assert.ok(v <= 40, 'must still be encodable');
});

test('qr: the printed sheets stay scannable at their real box size', () => {
  // Guards the URLs that actually go on paper. If the subdomain or a class slug grows and
  // pushes the code to a denser version, this fails here rather than at a parents' evening
  // in front of 22 families.
  const BOX_MM = 24;
  const urls = [
    'https://bungi-eltern.mrpia.ch/start',
    'https://bungi-eltern.mrpia.ch/f/3a',
    'https://bungi-eltern.mrpia.ch/f/kiga1',
    'https://bungi-eltern.mrpia.ch/merkblatt',
  ];
  for (const url of urls) {
    const r = qrPrintSize(url, BOX_MM);
    assert.ok(r.scannable, `${url}: only ${r.mmPerModule} mm/module at ${BOX_MM} mm`);
    assert.ok(r.mmPerModule >= 0.6, `${url}: ${r.mmPerModule} mm/module leaves no headroom`);
  }
});

test('qr: the print-size guard actually rejects something', () => {
  // A guard that never fires is not a guard.
  const tooMuch = qrPrintSize('https://example.com/?d=' + 'A'.repeat(300), 24);
  assert.equal(tooMuch.scannable, false);
  assert.ok(tooMuch.version > 10);
});

test('qr: quiet zone is counted inside the box, not added to it', () => {
  const r = qrPrintSize('https://bungi-eltern.mrpia.ch/f/3a', 24);
  assert.equal(r.version, 3);
  assert.equal(r.modules, 29);
  // 24 mm box, 29 of 37 module-widths are the code itself.
  assert.ok(Math.abs(r.codeMm - 24 * (29 / 37)) < 0.02, `codeMm was ${r.codeMm}`);
  assert.ok(r.codeMm < 24, 'the code must be smaller than its box');
});
