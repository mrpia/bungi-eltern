// QR codes as SVG.
//
// SVG rather than canvas/PNG on purpose: these codes go on paper. A canvas rendered at
// 96 dpi and printed at 600 dpi shows visibly stepped module edges, which is exactly the
// kind of degradation that makes a code fail to scan under a school's fluorescent light.
// An SVG path is rasterised by the printer at its own resolution.

import qrcode from '../vendor/qrcode.mjs';
import { stringToBytes } from '../vendor/qrcode-utf8.mjs';

// Replace the library's default byte conversion so umlauts survive. Without this a
// payload containing "Müller" encodes to mojibake.
qrcode.stringToBytes = stringToBytes;

/**
 * @param {string} text
 * @param {'L'|'M'|'Q'|'H'} ecc
 * @returns {{count: number, isDark: (r: number, c: number) => boolean}}
 */
export function qrModules(text, ecc = 'M') {
  if (!text) throw new Error('qr: empty payload');
  const qr = qrcode(0, ecc); // 0 = pick the smallest version that fits
  qr.addData(String(text));
  qr.make();
  return { count: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
}

/**
 * One <svg> with a single <path>, sized in module units via viewBox so CSS decides the
 * printed size. One path rather than one <rect> per module: a version-3 code has ~400
 * dark modules, and 400 rects per code times three codes times 13 classes is a lot of
 * markup for no visual difference.
 *
 * @param {string} text
 * @param {{ecc?: string, margin?: number, title?: string, className?: string}} [opts]
 *   margin is the quiet zone in modules. The spec requires 4; below that, scanners
 *   struggle when the code sits close to other print.
 */
export function qrSvg(text, opts = {}) {
  const { ecc = 'M', margin = 4, title = '', className = '' } = opts;
  const { count, isDark } = qrModules(text, ecc);
  const side = count + margin * 2;

  let d = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }

  const cls = className ? ` class="${className}"` : '';
  const label = title
    ? `<title>${String(title).replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]))}</title>`
    : '';
  return (
    `<svg${cls} viewBox="0 0 ${side} ${side}" width="100%" height="100%" ` +
    `xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="img">` +
    `${label}<rect width="${side}" height="${side}" fill="#fff"/>` +
    `<path d="${d}" fill="#000"/></svg>`
  );
}

export function qrVersion(text, ecc = 'M') {
  return (qrModules(text, ecc).count - 17) / 4;
}

/** Below this, scanning a printed code off paper with an average phone gets unreliable. */
export const MIN_MM_PER_MODULE = 0.5;

/**
 * What a payload actually measures once printed in a box of a given size.
 *
 * The trap this exists for: the quiet zone lives *inside* the box. A 24 mm slot holding a
 * version-3 code (29 modules plus 8 of margin) prints only 18.8 mm of actual code. Sizing
 * by the box and assuming that is the code size overestimates every module by a fifth.
 *
 * @param {string} text payload to encode
 * @param {number} boxMm printed width of the slot the SVG fills
 */
export function qrPrintSize(text, boxMm, opts = {}) {
  const { ecc = 'M', margin = 4 } = opts;
  const modules = qrModules(text, ecc).count;
  const total = modules + margin * 2;
  const codeMm = boxMm * (modules / total);
  const mmPerModule = codeMm / modules;
  return {
    version: (modules - 17) / 4,
    modules,
    codeMm: Math.round(codeMm * 100) / 100,
    mmPerModule: Math.round(mmPerModule * 1000) / 1000,
    scannable: mmPerModule >= MIN_MM_PER_MODULE,
  };
}
