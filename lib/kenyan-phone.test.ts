import assert from 'node:assert/strict'
import test from 'node:test'
import { formatKenyanPhoneInput, normalizeKenyanPhoneInput } from './kenyan-phone.ts'

test('normalizes only the requested Kenyan mobile input formats', () => {
  assert.equal(normalizeKenyanPhoneInput('0712345678'), '254712345678')
  assert.equal(normalizeKenyanPhoneInput('+254712345678'), '254712345678')
  assert.equal(normalizeKenyanPhoneInput('+254112345678'), '254112345678')

  for (const phone of [
    '0112345678',
    '254712345678',
    '+25471234567',
    '071234567',
    '07123456789',
    '07 1234 5678',
    '+254 712345678',
    '712345678',
  ]) {
    assert.equal(normalizeKenyanPhoneInput(phone), null, `${phone} should be rejected`)
  }
})

test('formats stored Kenyan mobile numbers for editing', () => {
  assert.equal(formatKenyanPhoneInput('254712345678'), '+254712345678')
  assert.equal(formatKenyanPhoneInput('0712345678'), '0712345678')
  assert.equal(formatKenyanPhoneInput(null), '')
})
