import test from 'node:test'
import assert from 'node:assert/strict'
import { canManageTenant } from './tenant-role-access.ts'

test('workspace owners and admins can manage tenant data', () => {
  assert.equal(canManageTenant('owner'), true)
  assert.equal(canManageTenant('admin'), true)
})

test('workspace members and unknown roles are read-only', () => {
  assert.equal(canManageTenant('member'), false)
  assert.equal(canManageTenant(''), false)
  assert.equal(canManageTenant('platform-admin'), false)
})
