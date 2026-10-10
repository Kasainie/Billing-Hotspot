import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { toFreeRadiusExpiration, toHotspotProduct, toHotspotRadiusReplies } from './hotspot-products.ts'
import { prepareHotspotPortalHtml } from './hotspot-portal-html.ts'
import { hotspotPortalTemplates } from './hotspot-templates.ts'
import { normalizeKenyanPhone } from './daraja.ts'
import { getProvisioningDbErrorMessage } from './provisioning-errors.ts'
import { buildRouterMonitorScript } from './router-monitor-script.ts'
import { buildFetchCommand, buildProvisioningScript, buildServiceConfigFetchCommand, buildSubscriberServiceScript, findWanBridgeConflict, findWanBridgeSubnetConflict, findWanSubnetConflict, getHotspotBundleScript, isValidProvisioningBaseUrl, parseServiceSubnet, readRouterInventoryPayload, selectRouterBridgeName } from './router-provisioning.ts'

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
  assert.match(command, /^:local lktechStage "download"; :do \{ \/tool fetch mode=https url="https:\/\/billing\.example\.com\/provision\/token123\/configure" dst-path=billing-services\.rsc;/)
  assert.match(command, /:set lktechStage "import"; :onerror lktechImportError in=\{ \/import billing-services\.rsc verbose=yes \} do=\{:put \("LKTECH import error: " \. \$lktechImportError\); :error "RouterOS service import failed"\};/)
  assert.match(command, /:set lktechStage "confirmation"; \/tool fetch mode=https url="https:\/\/billing\.example\.com\/provision\/token123\/configured" keep-result=no/)
  assert.match(command, /\/import billing-services\.rsc verbose=yes/)
  assert.match(command, /on-error=\{:put \("LKTECH service configuration failed during " \. \$lktechStage \. "; confirmation was not sent"\)\}$/)
})

test('router monitor reports its configured management ports rather than assuming defaults', () => {
  const script = buildRouterMonitorScript({
    routerId: '00000000-0000-4000-8000-000000000000',
    monitorToken: 'a'.repeat(43),
    telemetryUrl: 'https://billing.example.com/api/routers/telemetry',
  })

  assert.match(script, /\/ip service find where name="winbox" and disabled=no/)
  assert.match(script, /name="www-ssl" and disabled=no/)
  assert.match(script, /name="www" and disabled=no/)
  assert.match(script, /"winboxPort"=\$winboxPort/)
  assert.match(script, /"winboxEnabled"=\$winboxEnabled/)
  assert.match(script, /"webEnabled"=\$webEnabled/)
  assert.match(script, /"webScheme"=\$webScheme/)
  assert.match(script, /"webPort"=\$webPort/)
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

test('standalone RouterOS files match the generated default-tenant bundle', () => {
  for (const fileName of ['certificates.rsc', 'config.rsc', 'hotspot-files.rsc', 'hotspot.rsc']) {
    const source = readFileSync(new URL(`../public/routeros/${fileName}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    assert.equal(source, getHotspotBundleScript(fileName))
  }
})

test('MikroTik Hotspot and PPPoE accounting report every minute', () => {
  const hotspotScript = getHotspotBundleScript('hotspot.rsc')
  const subscriberScript = buildSubscriberServiceScript({
    bridgeName: 'lktech',
    ports: ['ether2'],
    services: ['Hotspot', 'PPPoE'],
    hotspotSubnet: '172.31.0.0/24',
    pppoeSubnet: '172.31.1.0/24',
  })
  assert.match(hotspotScript!, /radius-accounting=yes radius-interim-update=1m/)
  assert.doesNotMatch(hotspotScript!, /radius-interim-update=5m/)
  assert.match(subscriberScript, /\/ppp aaa set use-radius=yes accounting=yes interim-update=1m/)
  assert.doesNotMatch(subscriberScript, /interim-update=5m/)
})

test('static LKTECH bootstrap requires a one-time provisioning URL', () => {
  const bootstrap = readFileSync(new URL('../public/routeros/lktech.rsc', import.meta.url), 'utf8')
  assert.match(bootstrap, /PASTE_SHORT_LIVED_TOKEN/)
  assert.match(bootstrap, /\/tool fetch mode=https url=\$provisioningUrl dst-path=lktech-provisioning\.rsc/)
  assert.match(bootstrap, /\/import lktech-provisioning\.rsc/)
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

  assert.match(loginPage, /class="hotspot-home mari-net-portal"/)
  assert.match(loginPage, /class="marinet-brand">Mari-Net<\/h1>/)
  assert.match(loginPage, /action="\$\(link-login-only\)"/)
  assert.match(loginPage, /onsubmit="return doLogin\(this\)"/)
  assert.doesNotMatch(loginPage, /\$\(if chap-id\)|\$\(endif\)/)
  assert.match(loginPage, /billingBaseUrl = window\.location\.hostname === 'localhost' \|\| window\.location\.hostname === '127\.0\.0\.1'/)
  assert.match(loginPage, /fetch\(billingBaseUrl \+ '\/api\/hotspot\/portal-template'/)
  assert.match(loginPage, /portalSettings\.companyName/)
  assert.match(loginPage, /portalSettings\.supportMessage/)
  assert.match(loginPage, /setAttribute\('data-portal-template', portalSettings\.activeTemplate\)/)
  assert.match(loginPage, /portal-theme'\)\.href = billingBaseUrl \+ '\/api\/hotspot\/portal-theme' \+ tenantQuery/)
  assert.match(loginPage, /class="marinet-tabs"/)
  assert.match(loginPage, /class="portlet login-panel" name="voucherLogin" action="\$\(link-login-only\)" method="post" onsubmit="return doLogin\(this\)"/)
  assert.match(loginPage, /<h3>Connect with Voucher<\/h3>/)
  assert.match(loginPage, /name="username"[^>]*placeholder="Enter voucher username"/)
  assert.match(loginPage, /name="password"[^>]*placeholder="Enter voucher password"/)
  assert.doesNotMatch(loginPage, /\/hotspot\/redeem/)
  assert.match(loginPage, /name="code"/)
  assert.match(loginPage, /class="support-line">Support:/)
  assert.match(loginPage, /id="portal-theme" rel="stylesheet"/)
  const portalStyles = readFileSync(new URL('../public/hotspot-assets/style.css', import.meta.url), 'utf8')
  for (const templateId of ['original', 'fresh', 'skyline', 'copperline', 'graphite', 'cobalt', 'lagoon', 'ember']) {
    assert.match(portalStyles, new RegExp(`data-portal-template="${templateId}"`))
  }
  assert.match(loginPage, /name="dst" value="\$\(link-orig\)"/)
  assert.match(loginPage, /hexMD5\('\$\(chap-id\)' \+ form\.elements\.password\.value \+ '\$\(chap-challenge\)'\)/)
  assert.match(loginPage, /name="username"/)
  assert.match(loginPage, /name="password"/)
  assert.match(loginPage, /var portalClientMac = '\$\(mac\)'/)
  assert.match(loginPage, /function activateFreePackage\(product, button\)/)
  assert.match(loginPage, /fetch\(billingBaseUrl \+ '\/api\/hotspot\/free' \+ tenantQuery/)
  assert.match(loginPage, /JSON\.stringify\(\{ packageId: product\.id, mac: portalClientMac \}\)/)
  assert.match(loginPage, /loginForm\.elements\.username\.value = account\.username/)
  assert.match(loginPage, /doLogin\(loginForm\)/)
  assert.match(loginPage, /if \(product\.price === 0\)/)
  assert.match(loginPage, /tap to connect automatically/)
  assert.match(connectedPage, /href="\$\(link-redirect\)"/)
  assert.match(connectedPage, /window\.location\.replace\('\$\(link-redirect\)'\)/)
  assert.match(statusPage, /\$\(link-logout\)/)
  assert.match(errorPage, /\$\(error\)/)
  assert.match(logoutPage, /\$\(link-login\)/)
  assert.match(connectedPage, /navigator\.sendBeacon\(bindUrl/)
  for (const [pageName, page] of [
    ['alogin.html', connectedPage],
    ['status.html', statusPage],
    ['error.html', errorPage],
    ['logout.html', logoutPage],
  ]) {
    assert.match(page, /<body class="hotspot-home">/, `${pageName} uses the captive portal theme`)
    assert.match(page, /class="portal-header"/, `${pageName} uses the shared portal header`)
    assert.match(page, /--portal-wallpaper/, `${pageName} uses the portal background`)
  }
})

test('captive portal uses absolute stylesheet and CHAP script URLs', () => {
  const loginPage = readFileSync(new URL('../public/hotspot-assets/login.html', import.meta.url), 'utf8')
  const prepared = prepareHotspotPortalHtml(loginPage, 'marinet', 'https://billing.example.com')
  assert.match(prepared, /href="https:\/\/billing\.example\.com\/hotspot-assets\/style\.css"/)
  assert.match(prepared, /src="https:\/\/billing\.example\.com\/hotspot-assets\/md5\.js"/)
  assert.match(prepared, /var portalTenantSlug = "marinet";/)
})

test('captive portal loads tenant packages and carries the selected package into checkout', () => {
  const loginPage = readFileSync(new URL('../public/hotspot-assets/login.html', import.meta.url), 'utf8')
  assert.match(loginPage, /fetch\(billingBaseUrl \+ '\/api\/hotspot\/packages' \+ tenantQuery/)
  assert.match(loginPage, /button\.className = 'package-card'/)
  assert.match(loginPage, /selectedPackage\.value = product\.id/)
  assert.match(loginPage, /name="package"/)
  assert.match(loginPage, /Select a package before continuing/)
  assert.match(loginPage, /product\.name/)
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
    fupUploadRate: '1M',
    fupDownloadRate: '2M',
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
    fupUploadRate: '1M',
    fupDownloadRate: '2M',
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
  ])
})

test('FUP accounting migration configures throttled upload and download rates for the next login', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261010120000_add_hotspot_fup_throttling.sql', import.meta.url), 'utf8')
  assert.match(migration, /fup_upload_rate text/)
  assert.match(migration, /fup_download_rate text/)
  assert.match(migration, /create trigger hotspot_fup_throttle_on_accounting/)
  assert.match(migration, /update public\.radreply[\s\S]*?value = upload_rate \|\| '\/' \|\| download_rate/)
  assert.match(migration, /accounting\.acctinputoctets[\s\S]*?accounting\.acctoutputoctets/)
  assert.match(migration, /fup_limit_bytes/)
})

test('package expiry is formatted for the FreeRADIUS expiration module', () => {
  assert.equal(toFreeRadiusExpiration(new Date('2026-10-01T17:12:47.000Z')), 'Thu 01 Oct 2026 17:12:47 UTC')
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
  assert.match(script, /dns-name="login\.lktech\.life"/)
  assert.match(script, /dns-server="172\.31\.0\.1"/)
  assert.match(script, /ip dns set allow-remote-requests=yes/)
  assert.doesNotMatch(script, /dns-server=1\.1\.1\.1,8\.8\.8\.8/)
  assert.match(script, /billing-hotspot-pool/)
  assert.match(script, /network="172\.31\.0\.0" and address!="172\.31\.0\.1\/24"/)
  assert.doesNotMatch(script, /bridge already has another IP address/)
  assert.match(script, /billing-pppoe-pool/)
  assert.match(script, /hotspot walled-garden add dst-host="billing\.lktech\.life" action=allow/)
  assert.match(script, /billing-pppoe-profile/)
  assert.match(script, /pppoe-server server add service-name="billing-pppoe" interface="lktech"/)
  assert.match(script, /Existing DHCP network must match 172\.31\.0\.0\/24 with gateway 172\.31\.0\.1/)
  assert.match(script, /Every existing DHCP pool range must stay within 172\.31\.0\.0\/24/)
  assert.match(script, /interface="lktech" and disabled=no/)
  assert.doesNotMatch(script, /A DHCP server already exists/)
  assert.match(script, /Refusing to move ether2; it already belongs to another bridge/)
  assert.match(script, /Refusing to bridge active DHCP uplink ether2/)
})

test('subscriber service selection removes unchecked bridge ports and protects WAN ports', () => {
  const script = buildSubscriberServiceScript({
    bridgeName: 'bridge',
    ports: ['ether2', 'ether3', 'ether4'],
    managedPorts: ['ether2', 'ether3', 'ether4', 'ether5'],
    wanPorts: ['wan1'],
    services: ['Hotspot'],
    hotspotSubnet: '192.168.88.0/24',
  })

  assert.match(script, /interface="ether5" and bridge="bridge"\]\] > 0\) do=\{\/interface bridge port remove/)
  assert.doesNotMatch(script, /interface="ether2" and bridge="bridge"\]\] > 0\) do=\{\/interface bridge port remove/)
  assert.match(script, /Uplink wan1 is already on bridge; remove it from the subscriber bridge/)
  assert.doesNotMatch(script, /interface="wan1" and bridge="bridge"\]\] > 0\) do=\{\/interface bridge port remove/)
  assert.doesNotMatch(script, /interface="ether5" and bridge!/)
})

test('subscriber service configuration rejects selected or managed WAN ports', () => {
  assert.throws(() => buildSubscriberServiceScript({
    bridgeName: 'bridge',
    ports: ['wan1'],
    managedPorts: ['ether2', 'wan1'],
    wanPorts: ['wan1'],
    services: ['Hotspot'],
    hotspotSubnet: '192.168.88.0/24',
  }), /interface name is invalid/)
})

test('subscriber service script uses RouterOS-safe line lengths', () => {
  const script = buildSubscriberServiceScript({
    bridgeName: 'lktech',
    ports: ['ether2', 'ether3'],
    services: ['Hotspot', 'PPPoE'],
    hotspotSubnet: '172.31.0.0/24',
    pppoeSubnet: '172.31.1.0/24',
  })

  assert.match(script, /^:do \{\n/)
  assert.match(script, /\n\}$/)
  assert.ok(Math.max(...script.split('\n').map((line) => line.length)) < 4096)
  assert.ok(script.includes(':local existingBridgeDhcp'))
  assert.ok(script.includes(':if ([:len $existingBridgeDhcp]'))
})

test('existing 192.168.88.0/24 DHCP can be reused without creating a second server', () => {
  const script = buildSubscriberServiceScript({
    bridgeName: 'bridge',
    ports: ['ether2', 'ether3'],
    services: ['Hotspot'],
    hotspotSubnet: '192.168.88.0/24',
  })

  assert.match(script, /Existing DHCP network must match 192\.168\.88\.0\/24 with gateway 192\.168\.88\.1/)
  assert.match(script, /:foreach existingBridgePoolRange in=\[:toarray \$existingBridgePoolRanges\] do=\{/)
  assert.match(script, /Every existing DHCP pool range must stay within 192\.168\.88\.0\/24/)
  assert.doesNotMatch(script, /existing DHCP pool has multiple ranges/)
  assert.ok(script.includes(':if ([:len [/ip dhcp-server find where interface="bridge" and disabled=no]] = 0)'))
  assert.match(script, /address="192\.168\.88\.1\/24" interface="bridge"/)
  assert.match(script, /hotspot-address="192\.168\.88\.1"/)
  assert.match(script, /dns-name="login\.lktech\.life"/)
  assert.match(script, /ip dns set allow-remote-requests=yes/)
  assert.match(script, /dns-server=\$hotspotGateway/)
  assert.match(script, /common-name="login\.lktech\.life" and trusted=yes/)
  assert.match(script, /ssl-certificate=\$hotspotCertificateName login-by=https,http-chap/)
  assert.match(script, /Android automatic captive-portal discovery remains unavailable/)
  assert.doesNotMatch(script, /https-redirect/)
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
  assert.match(script, /:foreach addressId in=\[\/ip address find\]/)
  assert.match(script, /"N\|" \. \$addressInterface \. "\|" \. \$addressNetwork/)
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
      interfaceNetworks: [{ interface: 'ether1', network: '192.168.88.0' }],
      bridges: ['bridge1'],
    }),
  })

  const inventory = await readRouterInventoryPayload(request)
  const interfaces = inventory.interfaces as Array<Record<string, unknown>> | undefined
  const bridgePorts = inventory.bridgePorts as Array<Record<string, unknown>> | undefined
  assert.equal(interfaces?.[0]?.name, 'ether1')
  assert.equal(bridgePorts?.[0]?.bridge, 'bridge1')
  assert.deepEqual(inventory.interfaceNetworks, [{ interface: 'ether1', network: '192.168.88.0' }])
})

test('raw RouterOS inventory records are parsed into interfaces, WAN, bridges, and bridge ports', async () => {
  const request = new Request('https://billing.example.com/provision/token123/complete', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'I|ether1|true|false;I|ether2|true|false;P|ether2|lktech;W|ether1;N|ether1|192.168.88.0;B|lktech',
  })

  const inventory = await readRouterInventoryPayload(request)
  assert.deepEqual(inventory, {
    interfaces: [
      { name: 'ether1', running: 'true', disabled: 'false' },
      { name: 'ether2', running: 'true', disabled: 'false' },
    ],
    bridgePorts: [{ interface: 'ether2', bridge: 'lktech' }],
    wanInterfaces: ['ether1'],
    interfaceNetworks: [{ interface: 'ether1', network: '192.168.88.0' }],
    bridges: ['lktech'],
  })
})

test('Hotspot service configuration rejects a subnet that overlaps a detected WAN network', () => {
  const wanNetworks = [{ interface: 'ether1', network: '192.168.88.0' }]
  assert.deepEqual(findWanSubnetConflict('192.168.88.0/24', ['ether1'], wanNetworks), wanNetworks[0])
  assert.equal(findWanSubnetConflict('172.31.0.0/24', ['ether1'], wanNetworks), null)
  assert.equal(findWanSubnetConflict('192.168.88.0/24', ['ether2'], wanNetworks), null)
})

test('subscriber bridge cannot also host the active WAN DHCP client', () => {
  assert.equal(findWanBridgeConflict('bridgeLocal', ['bridgeLocal']), 'bridgeLocal')
  assert.equal(findWanBridgeConflict('bridgeLocal', ['ether1']), null)
})

test('subscriber bridge cannot keep an address in the active WAN network', () => {
  const networks = [
    { interface: 'ether1', network: '192.168.88.0' },
    { interface: 'bridgeLocal', network: '192.168.88.0' },
  ]
  assert.deepEqual(
    findWanBridgeSubnetConflict('bridgeLocal', ['ether1'], networks),
    { bridge: networks[1], wanInterface: 'ether1' },
  )
  assert.equal(findWanBridgeSubnetConflict('bridgeLocal', ['ether1'], [
    { interface: 'ether1', network: '192.168.88.0' },
    { interface: 'bridgeLocal', network: '172.31.0.0' },
  ]), null)
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
