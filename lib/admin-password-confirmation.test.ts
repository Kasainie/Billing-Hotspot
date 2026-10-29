import test from 'node:test'
import assert from 'node:assert/strict'
import { requiresAdminPasswordConfirmation } from './admin-password-confirmation.ts'

test('manual workspace and platform mutations require password confirmation', () => {
  assert.equal(requiresAdminPasswordConfirmation('/api/packages', 'POST'), true)
  assert.equal(requiresAdminPasswordConfirmation('/api/customers/123/status', 'PATCH'), true)
  assert.equal(requiresAdminPasswordConfirmation('/api/operations/plans', 'DELETE'), true)
  assert.equal(requiresAdminPasswordConfirmation('/api/platform-admin/tenants/123', 'PATCH'), true)
  assert.equal(requiresAdminPasswordConfirmation('/api/routers/123/resources', 'POST'), true)
  assert.equal(requiresAdminPasswordConfirmation('/api/tenant/members', 'POST'), true)
  assert.equal(requiresAdminPasswordConfirmation('/api/tenant/members/123', 'PATCH'), true)
  assert.equal(requiresAdminPasswordConfirmation('/api/tenant/members/123', 'DELETE'), true)
  assert.equal(requiresAdminPasswordConfirmation('/api/tenant/sms-settings', 'PUT'), true)
})

test('safe requests and automated integration endpoints do not require confirmation', () => {
  assert.equal(requiresAdminPasswordConfirmation('/api/packages', 'GET'), false)
  assert.equal(requiresAdminPasswordConfirmation('/api/tenant/members', 'GET'), false)
  assert.equal(requiresAdminPasswordConfirmation('/api/routers/telemetry', 'POST'), false)
  assert.equal(requiresAdminPasswordConfirmation('/api/hotspot/daraja/callback', 'POST'), false)
  assert.equal(requiresAdminPasswordConfirmation('/api/payment-gateways/intasend/webhook', 'POST'), false)
})
