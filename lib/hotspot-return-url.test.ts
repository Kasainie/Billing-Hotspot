import test from 'node:test'
import assert from 'node:assert/strict'
import { getHotspotReturnUrl } from './hotspot-return-url.ts'

test('trusted MikroTik HTTPS login URL is accepted for captive return', () => {
  assert.equal(
    getHotspotReturnUrl('https://login.lktech.life/login?lktech_login=1'),
    'https://login.lktech.life/login?lktech_login=1',
  )
})

test('private HTTP router return URLs remain supported', () => {
  assert.equal(getHotspotReturnUrl('http://192.168.88.1/login'), 'http://192.168.88.1/login')
  assert.equal(getHotspotReturnUrl('http://router.lan/login'), 'http://router.lan/login')
})

test('untrusted return hosts, protocols, and URL credentials are rejected', () => {
  assert.equal(getHotspotReturnUrl('https://attacker.example/login'), null)
  assert.equal(getHotspotReturnUrl('http://billing.lktech.life/login'), null)
  assert.equal(getHotspotReturnUrl('https://user:pass@login.lktech.life/login'), null)
  assert.equal(getHotspotReturnUrl('https://login.lktech.life:8443/login'), null)
})
