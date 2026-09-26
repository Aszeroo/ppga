# TA 16 BIT license & swap point (issue #5)

- **Asset**: `TA-16-Bit.zip` -> `Demo/TA16BIT-Regular.ttf` (copied in place, embedded
  via `next/font/local`).
- **Why `.ttf`, not `.woff2`**: the zip ships only `.ttf` and `.otf`. No
  `woff2_compress` / `woff2_convert` tool is installed in this environment and the
  only font-processing packages present are plain JS parsers — so a byte-accurate
  woff2 re-encode cannot be done here. `next/font/local` validates
  `/\.(woff|woff2|eot|ttf|otf)$/` — `.ttf` is a sanctioned format and the browser
  renders it directly; per `nextjs.org` docs `.ttf`/`.otf` are *preferred* over
  `.woff`. If a woff2 build-tool arrives later, re-encode and swap the `src` path.
- **License / provenance**: the archive is the "Demo" build of the TA 16 BIT
  family (8-bit pastel, Thai-based type design). The license terms are not in the
  archive (no ` OFL.txt`); treat it as a proprietary/uncertain licensing asset —
  so the swap point below is load-bearing.
- **Single-token swap point**: the family name is emitted by `next/font/local`
  as `--font-ta16bit` (see `app/fonts/ta16bit.tsx`): every heading / button /
  badge / XP-numeral component resolves that *variable only*, so a swap of the
  `src` path (or the variable's emitted value) in one place changes the whole
  app's heading face. Never write the family name into a component.
- **Glyph coverage read from the `name`/`OS/2`/`cmap`/`glyf` table directory
  (hexdump, not fonttools): the demo build is Latin + ASCII digits only. Thai
  glyphs are *not* in this file — so the Thai fallback to Mitr in heading roles
  (see `styles/globals.css` + `unicode-range`) is load-bearing, not cosmetic.
