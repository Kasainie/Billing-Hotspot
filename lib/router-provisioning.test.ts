import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { toFreeRadiusExpiration, toHotspotProduct, toHotspotRadiusReplies } from './hotspot-products.ts'
import { hotspotPortalTemplates } from './hotspot-templates.ts'
import { normalizeKenyanPhone } from './daraja.ts'
import { getProvisioningDbErrorMessage } from './provisioning-errors.ts'
import { buildFetchCommand, buildProvisioningScript, buildServiceConfigFetchCommand, buildSubscriberServiceScript, getHotspotBundleScript, isValidProvisioningBaseUrl, parseServiceSubnet, readRouterInventoryPayload, selectRouterBridgeName } from './router-provisioning.ts'

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
  const command = buildServiceConfigFetchCommand({
    scriptUrl: 'https://billing.example.com/provision/token123/configure',
    configuredUrl: 'https://billing.example.com/provision/token123/configured',
  })
  assert.match(command, /^:do \{ \/tool fetch mode=https url="https:\/\/billing\.example\.com\/provision\/token123\/configure" dst-path=billing-services\.rsc;/)
  assert.match(command, /\/import billing-services\.rsc;/)
  assert.match(command, /\/tool fetch mode=https url="https:\/\/billing\.example\.com\/provision\/token123\/configured" keep-result=no \} on-error=\{:put "LKTECH service configuration failed; confirmation was not sent"\}$/)
})

test('detected LKTech bridge is preferred over the legacy Centipid bridge', () => {
  assert.equal(selectRouterBridgeName(['centripid-bridge', 'lktech']), 'lktech')
  assert.equal(selectRouterBridgeName(['lktech-bridge']), 'lktech-bridge')
  assert.equal(selectRouterBridgeName(['bridge1']), 'bridge1')
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
  assert.ok(script!.includes('/api/hotspot/portal-login'), 'tenant-aware captive login page is included in the portal installer')
  for (const assetName of ['status.html', 'logout.html', 'error.html', 'alogin.html', 'api.json', 'style.css', 'md5.js']) {
    assert.ok(script!.includes(`/hotspot-assets/${assetName}`), `${assetName} is included in the portal installer`)
  }
})

test('tenant-aware router provisioning carries the workspace slug into downloaded captive portal files', () => {
  const provisioning = buildProvisioningScript({
    routerName: 'Office Router',
    radiusServerAddress: '192.0.2.10',
    radiusSecret: 'this-is-a-valid-secret',
    completeUrl: 'https://billing.example.com/provision/token/complete',
    tenantSlug: 'acme-network',
  })
  assert.match(provisioning, /\/hotspot\/hotspot-files\.rsc\?tenant=acme-network/)
  const portalBundle = getHotspotBundleScript('hotspot-files.rsc', 'https://billing.example.com', 'acme-network')
  assert.match(portalBundle!, /\/api\/hotspot\/portal-login\?tenant=acme-network/)
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

test('captive portal keeps MikroTik login fields, CHAP submission, and success redirect', () => {
  const loginPage = readFileSync(new URL('../public/hotspot-assets/login.html', import.meta.url), 'utf8')
  const connectedPage = readFileSync(new URL('../public/hotspot-assets/alogin.html', import.meta.url), 'utf8')
  const statusPage = readFileSync(new URL('../public/hotspot-assets/status.html', import.meta.url), 'utf8')
  const errorPage = readFileSync(new URL('../public/hotspot-assets/error.html', import.meta.url), 'utf8')
  const logoutPage = readFileSync(new URL('../public/hotspot-assets/logout.html', import.meta.url), 'utf8')

  assert.match(loginPage, /Connect to<br><span>what matters\.<\/span>/)
  assert.match(loginPage, /Work, learn, stream, and stay close to the people who matter/)
  assert.match(loginPage, /action="\$\(link-login-only\)"/)
  assert.match(loginPage, /onsubmit="return doLogin\(this\)"/)
  assert.match(loginPage, /id="all-subscription-plans" href="https:\/\/billing\.lktech\.life\/hotspot"/)
  assert.match(loginPage, /all-subscription-plans'\)\.href = billingBaseUrl \+ '\/hotspot'/)
  assert.match(loginPage, /window\.location\.replace\(billingBaseUrl \+ '\/hotspot'/)
  assert.match(loginPage, /routerLoginUrl\.searchParams\.set\('lktech_login', '1'\)/)
  assert.match(loginPage, /var portalTenantSlug = ''/)
  assert.doesNotMatch(loginPage, /\$\(if chap-id\)|\$\(endif\)/)
  assert.match(loginPage, /document\.querySelector\('\.purchase-form'\)\.action = billingBaseUrl \+ '\/hotspot\/checkout'/)
  assert.match(loginPage, /billingBaseUrl = window\.location\.hostname === 'localhost' \|\| window\.location\.hostname === '127\.0\.0\.1'/)
  assert.match(loginPage, /fetch\(billingBaseUrl \+ '\/api\/hotspot\/portal-template'/)
  assert.match(loginPage, /portalSettings\.companyName/)
  assert.match(loginPage, /timeZone: 'Africa\/Nairobi'/)
  assert.match(loginPage, /if \(hour < 5\) return 'Good night'/)
  assert.match(loginPage, /if \(hour < 12\) return 'Good morning'/)
  assert.match(loginPage, /if \(hour < 17\) return 'Good afternoon'/)
  assert.match(loginPage, /if \(hour < 21\) return 'Good evening'/)
  assert.match(loginPage, /return 'Good night'/)
  assert.match(loginPage, /window\.setInterval\(updateCustomerGreeting, 60000\)/)
  const greetingFunction = loginPage.match(/function getCustomerTimeGreeting\([^)]*\) \{[\s\S]*?\n    \}/)?.[0]
  assert.ok(greetingFunction)
  for (const [hour, expected] of [
    [0, 'Good night'],
    [9, 'Good morning'],
    [12, 'Good afternoon'],
    [16, 'Good afternoon'],
    [17, 'Good evening'],
    [20, 'Good evening'],
    [21, 'Good night'],
  ] as const) {
    const result = runInNewContext(`${greetingFunction}\ngetCustomerTimeGreeting(${hour})`)
    assert.equal(result, expected)
  }
  assert.match(loginPage, /portalSettings\.welcomeHeadline/)
  assert.match(loginPage, /portalSettings\.supportMessage/)
  assert.match(loginPage, /name="receipt"/)
  assert.match(loginPage, /fetch\(billingBaseUrl \+ '\/api\/hotspot\/packages'/)
  assert.match(loginPage, /fetch\(billingBaseUrl \+ '\/api\/hotspot\/free'/)
  assert.match(loginPage, /fetch\(billingBaseUrl \+ '\/api\/hotspot\/roam\?mac='/)
  assert.match(loginPage, /id="client-mac" type="hidden" name="mac"/)
  assert.match(loginPage, /id="portal-theme" rel="stylesheet" href=""/)
  assert.match(loginPage, /portal-theme'\)\.href = billingBaseUrl \+ '\/api\/hotspot\/portal-theme'/)
  assert.match(loginPage, /class="portal-graphic" aria-hidden="true"/)
  assert.match(loginPage, /class="graphic-cable cable-east"/)
  assert.match(loginPage, /packageArt\.className = 'package-art'/)
  assert.match(loginPage, /speedLabel\.textContent = 'SPEED'/)
  assert.match(loginPage, /timeLabel\.textContent = 'PLAN TIME'/)
  assert.match(loginPage, /priceValue\.className = 'package-price-value'/)
  assert.match(loginPage, /Open this page through your MikroTik hotspot to claim a free package/)
  assert.doesNotMatch(loginPage, /data-package="(?:4-hours|12-hours|daily|monthly|6-hours|weekly)"/)
  assert.doesNotMatch(loginPage, /\$\(if error\)|\$\(error\)/)
  assert.match(loginPage, /name="dst" value="\$\(link-orig\)"/)
  assert.match(loginPage, /hexMD5\('\$\(chap-id\)' \+ form\.elements\.password\.value \+ '\$\(chap-challenge\)'\)/)
  assert.match(loginPage, /name="username"/)
  assert.match(loginPage, /name="password"/)
  assert.match(connectedPage, /href="\$\(link-redirect\)"/)
  assert.match(connectedPage, /window\.location\.replace\('\$\(link-redirect\)'\)/)
  assert.match(statusPage, /\$\(link-logout\)/)
  assert.match(errorPage, /\$\(error\)/)
  assert.match(logoutPage, /\$\(link-login\)/)
  assert.match(connectedPage, /navigator\.sendBeacon\(bindUrl/)
})

test('billing packages are converted to captive offers and Kenyan numbers are normalized', () => {
  assert.deepEqual(toHotspotProduct({
    id: 'package-id',
    name: 'Home 50',
    type: 'Hotspot',
    downloadMbps: 50,
    uploadMbps: 20,
    rateLimit: '20M/50M',
    monthlyPrice: 240,
    durationSeconds: 604800,
    devicesPerAccount: 2,
    burstLimit: '30M/60M',
    burstThreshold: '20M/40M',
    burstTimeSeconds: 30,
    fupEnabled: true,
    fupLimitBytes: 107374182400,
    scheduleEnabled: true,
    scheduleSpec: 'Mo-Fr0800-1800',
    nasRestrictions: ['10.10.1.1'],
  }), {
    id: 'package-id',
    name: 'Home 50',
    type: 'Hotspot',
    price: 240,
    durationSeconds: 604800,
    durationLabel: 'Valid for 7 days',
    rateLimit: '20M/50M',
    speedLabel: '20M/50M Mbps',
    devicesPerAccount: 2,
    burstLimit: '30M/60M',
    burstThreshold: '20M/40M',
    burstTimeSeconds: 30,
    fupEnabled: true,
    fupLimitBytes: 107374182400,
    scheduleEnabled: true,
    scheduleSpec: 'Mo-Fr0800-1800',
    nasRestrictions: ['10.10.1.1'],
  })
  assert.equal(normalizeKenyanPhone('0712345678'), '254712345678')
  assert.equal(normalizeKenyanPhone('+254712345678'), '254712345678')
  assert.equal(normalizeKenyanPhone('071234567'), null)
})

test('hotspot package policy is returned using MikroTik RADIUS attributes', () => {
  assert.deepEqual(toHotspotRadiusReplies('customer-1', {
    durationSeconds: 604800,
    devicesPerAccount: 2,
    rateLimit: '20M/50M',
    burstLimit: '30M/60M',
    burstThreshold: '20M/40M',
    burstTimeSeconds: 30,
    fupEnabled: true,
    fupLimitBytes: 107374182400,
  }), [
    { username: 'customer-1', attribute: 'Session-Timeout', op: '=', value: '604800' },
    { username: 'customer-1', attribute: 'Port-Limit', op: '=', value: '2' },
    { username: 'customer-1', attribute: 'Mikrotik-Rate-Limit', op: '=', value: '20M/50M 30M/60M 20M/40M 30/30' },
    { username: 'customer-1', attribute: 'Mikrotik-Total-Limit', op: '=', value: '107374182400' },
  ])
})

test('package expiry is formatted for the FreeRADIUS expiration module', () => {
  assert.equal(toFreeRadiusExpiration(new Date('2026-10-01T17:12:47.000Z')), 'Thu 01 Oct 2026 17:12:47 GMT')
})

test('portal design catalog has a stylesheet for every non-default template', () => {
  assert.deepEqual(hotspotPortalTemplates.map((template) => template.id), ['original', 'fresh', 'skyline', 'copperline', 'graphite', 'cobalt', 'lagoon', 'ember'])
  for (const template of hotspotPortalTemplates) {
    if (!template.stylesheet) continue
    const stylesheet = readFileSync(new URL(`../public/hotspot-assets/themes/${template.stylesheet}`, import.meta.url), 'utf8')
    assert.match(stylesheet, /body\.hotspot-home/)
  }
})

test('subscriber service script safely reuses matching bridge DHCP and configures Hotspot and PPPoE', () => {
  const script = buildSubscriberServiceScript({
    bridgeName: 'lktech',
    ports: ['ether2', 'ether3'],
    services: ['Hotspot', 'PPPoE'],
    hotspotSubnet: '172.31.0.0/24',
    pppoeSubnet: '172.31.1.0/24',
  })

  assert.match(script, /billing-hotspot-dhcp/)
  assert.match(script, /billing-hotspot-profile/)
  assert.match(script, /billing-hotspot-pool/)
  assert.match(script, /billing-pppoe-pool/)
  assert.match(script, /hotspot walled-garden add dst-host="billing\.lktech\.life" action=allow/)
  assert.match(script, /billing-pppoe-profile/)
  assert.match(script, /pppoe-server server add service-name="billing-pppoe" interface="lktech"/)
  assert.match(script, /Existing DHCP network must match 172\.31\.0\.0\/24 with gateway 172\.31\.0\.1/)
  assert.match(script, /Existing DHCP pool must stay within 172\.31\.0\.0\/24/)
  assert.match(script, /interface="lktech" and disabled=no/)
  assert.doesNotMatch(script, /A DHCP server already exists/)
  assert.match(script, /Refusing to move ether2; it already belongs to another bridge/)
  assert.match(script, /Refusing to bridge active DHCP uplink ether2/)
})

test('existing 192.168.88.0/24 DHCP can be reused without creating a second server', () => {
  const script = buildSubscriberServiceScript({
    bridgeName: 'bridge',
    ports: ['ether2', 'ether3'],
    services: ['Hotspot'],
    hotspotSubnet: '192.168.88.0/24',
  })

  assert.match(script, /Existing DHCP network must match 192\.168\.88\.0\/24 with gateway 192\.168\.88\.1/)
  assert.match(script, /Existing DHCP pool must stay within 192\.168\.88\.0\/24/)
  assert.ok(script.includes(':if ([:len [/ip dhcp-server find where interface="bridge" and disabled=no]] = 0)'))
  assert.match(script, /address="192\.168\.88\.1\/24" interface="bridge"/)
  assert.match(script, /hotspot-address="192\.168\.88\.1"/)
})

test('Hotspot anti-sharing protection adds a scoped TTL rule and removes it when disabled', () => {
  const enabledScript = buildSubscriberServiceScript({
    bridgeName: 'lktech',
    ports: ['ether2'],
    services: ['Hotspot'],
    hotspotAntiSharing: true,
    hotspotSubnet: '172.31.0.0/24',
  })
  assert.match(enabledScript, /chain=postrouting out-interface="lktech" dst-address="172\.31\.0\.0\/24" action=change-ttl new-ttl=set:1/)
  assert.match(enabledScript, /comment="billing-system-managed-hotspot-anti-sharing"/)

  const disabledScript = buildSubscriberServiceScript({
    bridgeName: 'lktech',
    ports: ['ether2'],
    services: ['Hotspot'],
    hotspotAntiSharing: false,
    hotspotSubnet: '172.31.0.0/24',
  })
  assert.doesNotMatch(disabledScript, /action=change-ttl/)
  assert.match(disabledScript, /firewall mangle remove .*billing-system-managed-hotspot-anti-sharing/)
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

test('provisioning script collects RouterOS interfaces and sends a flat inventory payload', () => {
  const script = buildProvisioningScript({
    routerName: 'MikroTik Main',
    radiusServerAddress: '192.0.2.10',
    radiusSecret: 'example-radius-secret-123',
    completeUrl: 'https://billing.example.com/provision/token123/complete',
  })

  assert.match(script, /RouterOS 7\.1 or newer is required/)
  assert.doesNotMatch(script, /:serialize/)
  assert.match(script, /:local inventoryData ""/)
  assert.match(script, /:foreach interfaceId in=\[\/interface ethernet find\]/)
  assert.match(script, /:foreach bridgePortId in=\[\/interface bridge port find\]/)
  assert.match(script, /:foreach dhcpClientId in=\[\/ip dhcp-client find where status="bound"\]/)
  assert.match(script, /:foreach bridgeId in=\[\/interface bridge find\]/)
  assert.match(script, /http-method=post http-data=\$inventoryData http-header-field="content-type:text\/plain"/)
  assert.doesNotMatch(script, /RouterOS 6|complete\/interface|complete\/wan|complete\/bridge/)
  for (const fileName of ['certificates.rsc', 'config.rsc', 'hotspot-files.rsc', 'hotspot.rsc']) {
    assert.match(script, new RegExp(`/hotspot/${fileName}.*dst-path=${fileName}`))
    assert.match(script, new RegExp(`/import ${fileName}`))
  }
  assert.match(script, /\/tool fetch url="https:\/\/billing\.example\.com\/provision\/token123\/complete" keep-result=no/)
  assert.match(script, /\/tool fetch url="https:\/\/billing\.example\.com\/provision\/token123\/complete"/)
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

test('raw RouterOS inventory records are parsed into interfaces, WAN, bridges, and bridge ports', async () => {
  const request = new Request('https://billing.example.com/provision/token123/complete', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'I|ether1|true|false;I|ether2|true|false;P|ether2|lktech;W|ether1;B|lktech',
  })

  const inventory = await readRouterInventoryPayload(request)
  assert.deepEqual(inventory, {
    interfaces: [
      { name: 'ether1', running: 'true', disabled: 'false' },
      { name: 'ether2', running: 'true', disabled: 'false' },
    ],
    bridgePorts: [{ interface: 'ether2', bridge: 'lktech' }],
    wanInterfaces: ['ether1'],
    bridges: ['lktech'],
  })
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
