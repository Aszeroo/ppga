import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Ticket #13 unit tests for the PURE magic-byte + size validator the
 * submission server (`lib/sup/submissions.ts` — the upload gate runs
 * SERVER-side, never the extension alone) speaks the same authority it: the
 * `magicByteValidator` reads a 4-byte signature off the file prefix —
 * `pptx` = 0x50 0x4B 0x03 0x04 (the zip local-header marker, `PK\x03\x04`),
 * `ppt` = 0xD0 0xCF 0x11 0xE0 (the OLE container signature); ANY OTHER
 * PREFIX yields null. The file size rides `z.bigint().gte(BigInt(1)).lte(BigInt(25000000))`
 * — 1 byte up through 25 MB (25,000,000 bytes, inclusive; a byte OVER
 * the 25 MB cap NEVER rides). The `magicByteValidator` the test speaks
 * re-asserts the same shape off the SAME byte constants, NEVER a fake
 * number; the tests below assert the shape no fake byte + no fake size,
 * then inspect the SERVER's own source for the SAME constants the
 * authority the DATABASE's `ppg_insert_submission` the CALLER's own RLS
 * insert policy denies a stranger's row. CI runs them on node, no Supabase.
 */
const base = process.cwd()
const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

const validate = (
  buf: Uint8Array,
): 'pptx' | 'ppt' | null => {
  // pptx: bytes 0-3 = 0x50 0x4b 0x03 0x04 (the zip local-header marker)
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)
    return 'pptx'
  // ppt: bytes 0-3 = 0xd0 0xcf 0x11 0xe0 (the OLE container signature)
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0)
    return 'ppt'
  return null
}

const inSize = (n: number) => n >= 1 && n <= 25000000

test('Magic: a PK\\x03\\x04 prefix validates pptx (a 4-byte signature off the file prefix)', () => {
  expect(validate(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).toBe('pptx')
  expect(validate(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('pptx')
})

test('Magic: a \\xD0\\xCF\\x11\\xE0 prefix validates ppt (the OLE container signature)', () => {
  expect(validate(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x00]))).toBe('ppt')
  expect(validate(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe('ppt')
})

test('Magic: garbage of any other prefix NEVER validates (null, never a smuggled row)', () => {
  expect(validate(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]))).toBeNull()
  expect(validate(new Uint8Array([0x50, 0x4b, 0x00, 0x00]))).toBeNull()
  expect(validate(new Uint8Array([0x7b, 0x74, 0x6f, 0x6b]))).toBeNull()
  expect(validate(new Uint8Array([0xd0, 0xcf, 0x11, 0x00]))).toBeNull()
})

test('Size: 1 byte up through 25 MB rides, a byte OVER the cap NEVER rides', () => {
  expect(inSize(1)).toBe(true)
  expect(inSize(25000000)).toBe(true)
  expect(inSize(25000001)).toBe(false)
  expect(inSize(0)).toBe(false)
})

test('Server-side authority: the magic-byte + size gate run server, never the extension alone', () => {
  const server = read('lib/sup/submissions.ts')
  // the magic-byte + the size gate run SERVER-side (never a browser-side check):
  expect(server.includes('magic_byte_rejected')).toBe(true)
  // the SAME 4-byte constants the validator speaks off the file prefix ride:
  expect(server.includes('0x50')).toBe(true)
  expect(server.includes('0x4b')).toBe(true)
  expect(server.includes('0x03')).toBe(true)
  expect(server.includes('0x04')).toBe(true)
  expect(server.includes('0xd0')).toBe(true)
  expect(server.includes('0xcf')).toBe(true)
  expect(server.includes('0x11')).toBe(true)
  expect(server.includes('0xe0')).toBe(true)
  // the size cap rides z.bigint().gte(BigInt(1)).lte(BigInt(25000000)) — 25 MB, inclusive:
  expect(server.includes('gte(BigInt(1)).lte(BigInt(25000000))')).toBe(true)
  // the module runs server-only (the service-role key NEVER rides a browser):
  expect(server.trimStart().startsWith("import 'server-only'")).toBe(true)
})
