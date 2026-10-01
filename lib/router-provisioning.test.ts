import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { getProvisioningDbErrorMessage } from './provisioning-errors.ts'
import { addRouterInventoryRecord, buildFetchCommand, buildProvisioningScript, buildServiceConfigFetchCommand, buildSubscriberServiceScript, getHotspotBundleScript, isValidProvisioningBaseUrl, parseServiceSubnet, readRouterInventoryPayload } from './router-provisioning.ts'

test('production WinBox command fetches and imports one self-contained provisioning script', () => {
  const scriptUrl = 'https://billing.example.com/provision/token123'
  const fetchCommand = buildFetchCommand({ scriptUrl, completeUrl: 'https://billing.example.com/provision/token123/complete' })

  assert.equal(fetchCommand, '/tool fetch mode=https url="https://billing.example.com/provision/token123" dst-path=lktech.rsc; :delay 2s; /import lktech.rsc')
  assert.doesNotMatch(fetchCommand, /\/tool fetch .*?url="https:\/\/billing\.example\.com\/provision\/token123\/complete"/i)
  assert.doesNotMatch(fetchCommand, /\/hotspot\//i)
  assert.doesNotMatch(fetchCommand, /router-setup\.rsc/i)
})

test('local HTTP fetch uses the localhost router bundle format for dev testing', () => {
  const scriptUrl = 'http://127.0.0.1:3000/provision/token123'
  const fetchCommand = buildFetchCommand({ scriptUrl })
  assert.equal(fetchCommand, '/tool fetch mode=http url="http://127.0.0.1:3000/provision/token123" dst-path=lktech.rsc; :delay 2s; /import lktech.rsc')
})

test('service configuration is downloaded and imported as a RouterOS file', () => {
  const command = buildServiceConfigFetchCommand({ scriptUrl: 'https://billing.example.com/provision/token123/configure' })
  assert.match(command, /\/tool fetch url="https:\/\/billing\.example\.com\/provision\/token123\/configure" dst-path=billing-services\.rsc/)
  assert.match(command, /\/import billing-services\.rsc/)
})

test('all RouterOS bundle files resolve to valid content', () => {
  for (const fileName of ['certificates.rsc', 'config.rsc', 'hotspot-files.rsc', 'hotspot.rsc']) {
    const script = getHotspotBundleScript(fileName)
    assert.ok(script?.trim())
  }
})

test('hotspot file bundle downloads portal pages and assets to RouterOS hotspot directory', () => {
  const script = getHotspotBundleScript('hotspot-files.rsc', 'https://billing.example.com')
  assert.match(script!, /dst-path="flash\/hotspot\/md5\.js"/)
  assert.match(script!, /dst-path="hotspot\/md5\.js"/)
  assert.match(script!, /flash\/hotspot/)
  assert.doesNotMatch(script!, /"\$[A-Za-z]/)
  for (const assetName of ['login.html', 'status.html', 'logout.html', 'error.html', 'alogin.html', 'api.json', 'style.css', 'md5.js']) {
    assert.ok(script!.includes(`/hotspot-assets/${assetName}`), `${assetName} is included in the portal installer`)
  }
})

test('portal CHAP helper matches standard MD5 vectors', () => {
  const source = readFileSync(new URL('../public/hotspot-assets/md5.js', import.meta.url), 'utf8')
  const sandbox: { window: { hexMD5?: (input: string) => string } } = { window: {} }
  runInNewContext(source, sandbox)
  const hexMD5 = sandbox.window.hexMD5
  assert.ok(hexMD5)
  for (const input of ['', 'a', 'abc', 'message digest', 'pässwörd']) {
    assert.equal(hexMD5(input), createHash('md5').update(input).digest('hex'))
  }
})

test('subscriber service script creates Hotspot DHCP and RADIUS PPPoE on the selected bridge', () => {
  const script = buildSubscriberServiceScript({
    bridgeName: 'centripid-bridge',
    ports: ['ether2', 'ether3'],
    services: ['Hotspot', 'PPPoE'],
    hotspotSubnet: '172.31.0.0/24',
    pppoeSubnet: '172.31.1.0/24',
  })

  assert.match(script, /billing-hotspot-dhcp/)
  assert.match(script, /billing-hotspot-profile/)
  assert.match(script, /billing-hotspot-pool/)
  assert.match(script, /billing-pppoe-pool/)
  assert.match(script, /billing-pppoe-profile/)
  assert.match(script, /pppoe-server server add service-name="billing-pppoe" interface="centripid-bridge"/)
  assert.match(script, /A DHCP server already exists/)
  assert.match(script, /Refusing to move ether2; it already belongs to another bridge/)
  assert.match(script, /Refusing to bridge active DHCP uplink ether2/)
})

test('subscriber service networks must be distinct private /24 networks', () => {
  assert.equal(parseServiceSubnet('172.31.0.0/24')?.gateway, '172.31.0.1')
  assert.equal(parseServiceSubnet('192.168.20.0/24')?.range, '192.168.20.2-192.168.20.254')
  assert.equal(parseServiceSubnet('8.8.8.0/24'), null)
  assert.equal(parseServiceSubnet('172.31.0.0/16'), null)
  assert.throws(() => buildSubscriberServiceScript({
    bridgeName: 'bridge1',
    ports: ['ether2'],
    services: ['Hotspot', 'PPPoE'],
    hotspotSubnet: '172.31.0.0/24',
    pppoeSubnet: '172.31.0.0/24',
  }), /must use different/)
})

test('provisioning script supports RouterOS 6+ without RouterOS 7 serialization', () => {
  const script = buildProvisioningScript({
    routerName: 'MikroTik Main',
    radiusServerAddress: '192.0.2.10',
    radiusSecret: 'example-radius-secret-123',
    completeUrl: 'https://billing.example.com/provision/token123/complete',
  })

  assert.match(script, /RouterOS 6\.0 or newer is required/)
  assert.doesNotMatch(script, /:serialize|\\\\"/)
  assert.match(script, /\/interface ethernet find/)
  for (const fileName of ['certificates.rsc', 'config.rsc', 'hotspot-files.rsc', 'hotspot.rsc']) {
    assert.match(script, new RegExp(`/hotspot/${fileName}.*dst-path=${fileName}`))
    assert.match(script, new RegExp(`/import ${fileName}`))
  }
  assert.match(script, /\/complete\/interface" http-method=post http-data=\$interfaceName/)
  assert.match(script, /\/complete\/wan" http-method=post http-data=\$wanInterface/)
  assert.match(script, /\/complete\/bridge" http-method=post http-data=\$bridgeName/)
  assert.doesNotMatch(script, /\/file remove|billing-inventory\.tmp|keep-result=no/)
  assert.doesNotMatch(script, /keep-result=no/)
  assert.doesNotMatch(script, /\?record=/)
  assert.doesNotMatch(script, /http-header-field/)
  assert.doesNotMatch(script, /\$inventoryData|:serialize/)
  assert.match(script, /\/tool fetch url="https:\/\/billing\.example\.com\/provision\/token123\/complete"/)
})

test('RouterOS 6 inventory records are parsed into the wizard inventory shape', async () => {
  const request = new Request('https://billing.example.com/provision/token123/complete', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'I|ether1;P|ether2|bridge1;W|ether1;B|bridge1',
  })

  const inventory = await readRouterInventoryPayload(request)
  assert.deepEqual(inventory, {
    interfaces: [{ name: 'ether1', running: 'false', disabled: 'false' }],
    bridgePorts: [{ interface: 'ether2', bridge: 'bridge1' }],
    wanInterfaces: ['ether1'],
    bridges: ['bridge1'],
  })
})

test('single RouterOS inventory records merge without duplicates', () => {
  const first = addRouterInventoryRecord(null, 'interface', 'ether1')
  const withWan = addRouterInventoryRecord(first, 'wan', 'ether1')
  const withBridge = addRouterInventoryRecord(withWan, 'bridge', 'bridge1')
  const duplicate = addRouterInventoryRecord(withBridge, 'interface', 'ether1')

  assert.deepEqual(duplicate, {
    interfaces: [{ name: 'ether1', running: false, disabled: false }],
    bridgePorts: [],
    wanInterfaces: ['ether1'],
    bridgeName: 'bridge1',
  })
  assert.equal(addRouterInventoryRecord(duplicate, 'interface', 'bad/name'), null)
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
