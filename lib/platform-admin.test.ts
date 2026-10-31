import test from 'node:test'
import assert from 'node:assert/strict'
import { getPlatformAdminEmails, isPlatformAdminEmail } from './platform-admin-access.ts'

test('only the LKTECH platform owner email receives platform admin access', () => {
  const configured = getPlatformAdminEmails('owner@example.com,second@example.com')
  assert.equal(configured.size, 1)
  assert.equal(isPlatformAdminEmail('info@lktech.life', configured), true)
  assert.equal(isPlatformAdminEmail('INFO@LKTECH.LIFE', configured), true)
  assert.equal(isPlatformAdminEmail('kochjomboz04@gmail.com', configured), false)
  assert.equal(isPlatformAdminEmail('info@lktech.life.attacker.test', configured), false)
})

test('platform admin access does not fall back to an environment allowlist', () => {
  assert.equal(isPlatformAdminEmail('owner@example.com', getPlatformAdminEmails('owner@example.com')), false)
})
