import test from 'node:test'
import assert from 'node:assert/strict'
import { serializeDatabaseTimestamp } from './database-timestamp.ts'

test('serializes database timestamps returned as Date objects or strings', () => {
  const expected = '2026-10-16T12:00:00.000Z'
  assert.equal(serializeDatabaseTimestamp(new Date(expected)), expected)
  assert.equal(serializeDatabaseTimestamp(expected), expected)
  assert.equal(serializeDatabaseTimestamp(null), null)
})

test('rejects invalid database timestamps', () => {
  assert.throws(() => serializeDatabaseTimestamp('not-a-timestamp'), RangeError)
})
