import test from 'node:test'
import assert from 'node:assert/strict'
import { escapeCsvField, parseCsv } from './subscriber-csv.ts'

test('parses quoted fields, escaped quotes, embedded newlines, and a UTF-8 BOM', () => {
  assert.deepEqual(parseCsv('\uFEFFName,Email,Note\r\n"Ada Lovelace",ada@example.com,"said ""hello""\nand left"\r\n'), [
    ['Name', 'Email', 'Note'],
    ['Ada Lovelace', 'ada@example.com', 'said "hello"\nand left'],
  ])
})

test('ignores empty rows and rejects unclosed quoted fields', () => {
  assert.deepEqual(parseCsv('Name,Email\n\nAda,ada@example.com\n'), [
    ['Name', 'Email'],
    ['Ada', 'ada@example.com'],
  ])
  assert.throws(() => parseCsv('Name,Email\n"Ada,ada@example.com'), /unclosed quoted field/)
})

test('CSV output escapes quotes and protects spreadsheet formulas', () => {
  assert.equal(escapeCsvField('a "quote"'), '"a ""quote"""')
  assert.equal(escapeCsvField('=1+1'), '"\'=1+1"')
})
