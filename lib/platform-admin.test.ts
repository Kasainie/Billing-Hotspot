import test from 'node:test'
import assert from 'node:assert/strict'
import { getPlatformAdminEmails, isPlatformAdminEmail } from './platform-admin-access.ts'

test('platform admin email allowlist matches exact normalized addresses', () => {
  const configured = getPlatformAdminEmails(' Owner@Example.com, second@example.com ,,')
  assert.equal(configured.size, 2)
  assert.equal(isPlatformAdminEmail('owner@example.com', configured), true)
  assert.equal(isPlatformAdminEmail('SECOND@example.com', configured), true)
  assert.equal(isPlatformAdminEmail('attacker@example.com', configured), false)
  assert.equal(isPlatformAdminEmail('owner@example.com.attacker.test', configured), false)
})

test('an empty platform admin allowlist grants no access', () => {
  assert.equal(isPlatformAdminEmail('owner@example.com', getPlatformAdminEmails(' , ')), false)
})
