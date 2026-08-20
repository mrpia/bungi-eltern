# Vendored libraries

Checked in rather than installed. No npm at runtime, no CDN: this tool is handed to new
delegates every September and must still start in five years, and a delegate with some IT
knowledge should be able to read what they are running.

Files are **byte-identical** to the published package — no header was added, so the
checksums below can be verified against the registry.

## qrcode-generator 2.0.4

- Author: Kazuhiko Arase — <https://github.com/kazuhikoarase/qrcode-generator>
- Licence: MIT
- Registry: `npm pack qrcode-generator@2.0.4`, files `dist/qrcode.mjs` and `dist/qrcode_UTF8.mjs`
- Note: "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

| Datei | Herkunft | sha256 |
|---|---|---|
| `qrcode.mjs` | `dist/qrcode.mjs` | `ea91d7118a5395289170da848b7c6758b996163bfbccf312591ab65a4911b7c0` |
| `qrcode-utf8.mjs` | `dist/qrcode_UTF8.mjs` | `b06a0931c600eb94557c7949af2b0addfbd7fb56928b27859edec50f26919560` |

The UTF-8 file is a 1.5 KB add-on that replaces the library's default byte conversion.
`src/core/qr.js` installs it, so umlauts in a payload survive encoding.

### Why not hand-roll it

A QR encoder needs Reed-Solomon error correction and mask evaluation. That is precisely
the kind of code that looks right, passes a smoke test, and produces codes that fail to
scan on one phone in ten. 52 KB of proven MIT code is the cheaper choice.
