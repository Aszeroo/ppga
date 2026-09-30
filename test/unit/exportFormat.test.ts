import { test, expect } from 'vitest'

import { unzipSync, strFromU8 } from 'fflate'

import {
  buildCsv,
  buildXlsx,
  csvCell,
  exportFilename,
  exportStamp,
} from '../../lib/sup/exportFormat'

/**
 * Ticket #16 export serializers (pure, no stack): the CSV bytes (BOM, CRLF,
 * RFC 4180 escaping — commas/quotes/newlines — Thai raw UTF-8), the XLSX
 * workbook (a real zip container with the sheet's values, verified by
 * unzipping the exact buffer the route streams), and the filename stamp.
 * The route streams these verbatim — so these bytes ARE the download.
 */

test('CSV: UTF-8 BOM + CRLF so Thai reads correctly in Excel', () => {
  const csv = buildCsv(['student_id', 'full_name'], [
    { student_id: '64110001', full_name: 'Learner One' },
  ])
  expect(csv.startsWith('\ufeff')).toBe(true) // the BOM
  expect(csv).toBe('\ufeffstudent_id,full_name\r\n64110001,Learner One\r\n')
})

test('CSV: commas, quotes and newlines ride RFC 4180 escaping (doubled quotes)', () => {
  expect(csvCell('safe')).toBe('safe')
  expect(csvCell('a,b')).toBe('"a,b"')
  expect(csvCell('say "hi"')).toBe('"say ""hi"""')
  expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  expect(csvCell(null)).toBe('')
  expect(csvCell(21)).toBe('21')
  expect(csvCell(false)).toBe('false')
  // a jsonb answers object rides compact JSON, quoted per RFC 4180
  expect(csvCell({ item_1: 'A' })).toBe('"{""item_1"":""A""}"')
})

test('CSV: Thai identity cells leave as raw UTF-8 (the BOM carries Excel)', () => {
  const csv = buildCsv(['full_name'], [{ full_name: 'นักเรียน หนึ่ง, ก.' }])
  // quoted (comma) + raw Thai inside
  expect(csv).toBe('\ufefffull_name\r\n"นักเรียน หนึ่ง, ก."\r\n')
})

test('CSV: the empty cohort is a HEADER-ONLY file — valid, not an error', () => {
  const csv = buildCsv(['student_id', 'pretest_score'], [])
  expect(csv).toBe('\ufeffstudent_id,pretest_score\r\n')
})

test('XLSX: a real .xlsx zip with the extract — verified by unzipping the bytes', async () => {
  const buffer = await buildXlsx(
    ['student_id', 'full_name', 'rubric_latest_total'],
    [
      { student_id: '64110001', full_name: 'นักเรียน หนึ่ง', rubric_latest_total: 21 },
      { student_id: '64110002', full_name: null, rubric_latest_total: null },
    ],
  )
  // PK — the zip container every Excel/WPS/LibreOffice reader expects
  expect(buffer[0]).toBe(0x50)
  expect(buffer[1]).toBe(0x4b)
  const zip = unzipSync(new Uint8Array(buffer))
  expect(Object.keys(zip)).toContain('xl/worksheets/sheet1.xml')
  const all = Object.values(zip).map((f) => strFromU8(f)).join('')
  expect(all).toContain('64110001')
  expect(all).toContain('นักเรียน หนึ่ง') // Thai cell survives the round-trip
  expect(all).toContain('21') // the number rides as a number cell
  expect(all).toContain('rubric_latest_total') // the header row
})

test('XLSX: the empty cohort is a header-only sheet — a valid workbook, not an error', async () => {
  const buffer = await buildXlsx(['student_id'], [])
  const zip = unzipSync(new Uint8Array(buffer))
  expect(Object.keys(zip)).toContain('xl/worksheets/sheet1.xml')
  const all = Object.values(zip).map((f) => strFromU8(f)).join('')
  expect(all).toContain('student_id')
})

test('filenames: the UTC stamp mirrors the audit event run', () => {
  const stamp = exportStamp(new Date('2026-09-30T14:23:05.246Z'))
  expect(stamp).toBe('20260930T142305Z')
  expect(exportFilename('csv', stamp)).toBe('ppga-research-export-20260930T142305Z.csv')
  expect(exportFilename('xlsx', stamp)).toBe('ppga-research-export-20260930T142305Z.xlsx')
  expect(exportFilename('sql', stamp)).toBe('ppga-research-export-20260930T142305Z.sql')
})
