import test from 'node:test'
import assert from 'node:assert/strict'
import { getProvisioningDbErrorMessage } from './provisioning-errors.ts'
import { buildFetchCommand, buildProvisioningScript, getHotspotBundleScript, isValidProvisioningBaseUrl, readRouterInventoryPayload } from './router-provisioning.ts'

test('production fetch script uses the HTTPS router script format and downloads the full hotspot bundle', () => {
  const scriptUrl = 'https://billing.example.com/provision/token123'
  const fetchCommand = buildFetchCommand({ scriptUrl, completeUrl: 'https://billing.example.com/provision/token123/complete' })

  assert.match(fetchCommand, /\/tool fetch mode=https url="https:\/\/billing\.example\.com\/provision\/token123" dst-path=lktech\.rsc/i)
  assert.match(fetchCommand, /\/import lktech\.rsc/i)
  assert.match(fetchCommand, /\/tool fetch mode=https url="https:\/\/billing\.example\.com\/hotspot\/certificates\.rsc" dst-path=certificates\.rsc/i)
  assert.match(fetchCommand, /\/tool fetch mode=https url="https:\/\/billing\.example\.com\/hotspot\/config\.rsc" dst-path=config\.rsc/i)
  assert.match(fetchCommand, /\/tool fetch mode=https url="https:\/\/billing\.example\.com\/hotspot\/hotspot-files\.rsc" dst-path=hotspot-files\.rsc/i)
  assert.match(fetchCommand, /\/tool fetch mode=https url="https:\/\/billing\.example\.com\/hotspot\/hotspot\.rsc" dst-path=hotspot\.rsc/i)
  assert.doesNotMatch(fetchCommand, /\/tool fetch .*?url="https:\/\/billing\.example\.com\/provision\/token123\/complete"/i)
  assert.doesNotMatch(fetchCommand, /http-method=post/i)
  assert.doesNotMatch(fetchCommand, /router-setup\.rsc/i)
})

test('local HTTP fetch uses the localhost router bundle format for dev testing', () => {
  const scriptUrl = 'http://127.0.0.1:3000/provision/token123'
  const fetchCommand = buildFetchCommand({ scriptUrl })
  assert.match(fetchCommand, /\/tool fetch mode=http url="http:\/\/127\.0\.0\.1:3000\/provision\/token123" dst-path=lktech\.rsc/i)
  assert.match(fetchCommand, /\/tool fetch mode=http url="http:\/\/127\.0\.0\.1:3000\/hotspot\/certificates\.rsc" dst-path=certificates\.rsc/i)
  assert.match(fetchCommand, /\/import hotspot\.rsc/i)
})

test('all RouterOS bundle files resolve to valid content', () => {
  for (const fileName of ['certificates.rsc', 'config.rsc', 'hotspot-files.rsc', 'hotspot.rsc']) {
    const script = getHotspotBundleScript(fileName)
    assert.ok(script)
    assert.match(script!, /bundle/i)
  }
})

test('provisioning script supports RouterOS 6+ without RouterOS 7 serialization', () => {
  const script = buildProvisioningScript({
    routerName: 'MikroTik Main',
    radiusServerAddress: '192.0.2.10',
    radiusSecret: 'example-radius-secret-123',
    completeUrl: 'https://billing.example.com/provision/token123/complete',
  })

  assert.match(script, /RouterOS 6\.0 or newer is required/)
  assert.doesNotMatch(script, /:serialize/)
  assert.match(script, /\/interface ethernet find/)
  assert.match(script, /http-method=post http-data=\$routerInventoryJson/)
  assert.match(script, /\/tool fetch url="https:\/\/billing\.example\.com\/provision\/token123\/complete" keep-result=no/)
})

test('raw RouterOS JSON payloads are accepted by the completion endpoint parser', async () => {
  const request = new Request('https://billing.example.com/provision/token123/complete', {
    method: 'POST',
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: JSON.stringify({
      interfaces: [{ name: 'ether1', running: true, disabled: false }],
      bridgePorts: [{ interface: 'ether1', bridge: 'bridge1' }],
      wanInterfaces: ['ether1'],
      bridges: ['bridge1'],
    }),
  })

  const inventory = await readRouterInventoryPayload(request)
  const interfaces = inventory.interfaces as Array<Record<string, unknown>> | undefined
  const bridgePorts = inventory.bridgePorts as Array<Record<string, unknown>> | undefined
  assert.equal(interfaces?.[0]?.name, 'ether1')
  assert.equal(bridgePorts?.[0]?.bridge, 'bridge1')
})

test('localhost HTTP is accepted in development for local router provisioning', () => {
  assert.equal(isValidProvisioningBaseUrl(new URL('http://127.0.0.1:3000'), { NODE_ENV: 'development' }), true)
  assert.equal(isValidProvisioningBaseUrl(new URL('https://billing.lktech.life'), { NODE_ENV: 'production' }), true)
  assert.equal(isValidProvisioningBaseUrl(new URL('http://billing.lktech.life'), { NODE_ENV: 'production' }), false)
})

test('missing router provisioning table errors show actionable setup guidance', () => {
  const message = getProvisioningDbErrorMessage(new Error('relation "router_provisioning_tokens" does not exist'))
  assert.match(message, /router_provisioning_tokens|migration/i)
})
