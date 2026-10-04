import test from 'node:test'
import assert from 'node:assert/strict'
import { parseC2bTransaction } from './mobile-money-parser.ts'

test('C2B parser normalizes receipt IDs, Kenyan numbers, and Nairobi timestamps', () => {
  const parsed = parseC2bTransaction({
    TransID: 'abcd123456',
    TransTime: '20261004120000',
    TransAmount: '1200',
    BillRefNumber: '42000',
    MSISDN: '254712345678',
  })
  assert.equal(parsed.transactionId, 'ABCD123456')
  assert.equal(parsed.billReference, '42000')
  assert.equal(parsed.amount, 1200)
  assert.equal(parsed.phone, '254712345678')
  assert.equal(parsed.transactionAt?.toISOString(), '2026-10-04T09:00:00.000Z')
})

test('C2B parser rejects invalid receipt IDs, references, and fractional KSh amounts', () => {
  assert.throws(() => parseC2bTransaction({ TransID: 'bad', TransAmount: 10, BillRefNumber: '42000' }), /transaction ID/)
  assert.throws(() => parseC2bTransaction({ TransID: 'ABCD123456', TransAmount: 10.5, BillRefNumber: '42000' }), /amount/)
  assert.throws(() => parseC2bTransaction({ TransID: 'ABCD123456', TransAmount: 10, BillRefNumber: '' }), /reference/)
})

test('C2B parser rejects impossible transaction dates instead of normalizing them', () => {
  assert.throws(() => parseC2bTransaction({
    TransID: 'ABCD123456',
    TransTime: '20261304120000',
    TransAmount: 10,
    BillRefNumber: '42000',
  }), /timestamp/)
})
