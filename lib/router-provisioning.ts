function safeJsonParse(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    const maybeWrapped = trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : null
    if (maybeWrapped) {
      try {
        return JSON.parse(maybeWrapped)
      } catch {
        return null
      }
    }
    return null
  }
}

function parseRouterInventoryRecords(raw: string): Record<string, unknown> {
  const inventory = {
    interfaces: [] as Array<{ name: string; running: string; disabled: string }>,
    bridgePorts: [] as Array<{ interface: string; bridge: string }>,
    wanInterfaces: [] as string[],
    bridges: [] as string[],
  }

  for (const record of raw.split(';')) {
    const [kind, ...fields] = record.trim().split('|')
    if (kind === 'I' && fields.length === 1) {
      inventory.interfaces.push({ name: fields[0], running: 'false', disabled: 'false' })
    } else if (kind === 'I' && fields.length === 3) {
      inventory.interfaces.push({ name: fields[0], running: fields[1], disabled: fields[2] })
    } else if (kind === 'P' && fields.length === 2) {
      inventory.bridgePorts.push({ interface: fields[0], bridge: fields[1] })
    } else if (kind === 'W' && fields.length === 1) {
      inventory.wanInterfaces.push(fields[0])
    } else if (kind === 'B' && fields.length === 1) {
      inventory.bridges.push(fields[0])
    }
  }

  return inventory
}

export async function readRouterInventoryPayload(request: Request): Promise<Record<string, unknown>> {
  const clone = request.clone()

  try {
    const parsed = await clone.json() as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    // RouterOS may send a raw JSON body without the standard JSON content-type.
  }

  const rawText = await request.text()
  const parsed = safeJsonParse(rawText)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  return parseRouterInventoryRecords(rawText)
}

export function isValidProvisioningBaseUrl(baseUrl: URL, env: { NODE_ENV?: string } = process.env) {
  const isLocalDevelopmentHost = ['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname)
  const isLocalHttpOrigin = isLocalDevelopmentHost && baseUrl.protocol === 'http:'

  if (env.NODE_ENV === 'development' && isLocalHttpOrigin) {
    return baseUrl.pathname === '/' && !baseUrl.search && !baseUrl.hash
  }

  return baseUrl.protocol === 'https:' && baseUrl.pathname === '/' && !baseUrl.search && !baseUrl.hash
}

export function buildProvisioningScript({
  routerName,
  radiusServerAddress,
  radiusSecret,
  completeUrl,
  tenantSlug,
}: {
  routerName: string
  radiusServerAddress: string
  radiusSecret: string
  completeUrl: string
  tenantSlug?: string
}) {
  const safeName = routerName.replace(/\s+/g, ' ').trim()
  const radiusServices = 'ppp,hotspot'
  const radiusClientCommands = [
    ':local radiusEntry [/radius find where comment="billing-system-managed"]',
    ':if ([:len $radiusEntry] = 0) do={',
    `  /radius add address=${radiusServerAddress} secret="${radiusSecret}" service=${radiusServices} authentication-port=1812 accounting-port=1813 timeout=1s comment="billing-system-managed"`,
    '} else={',
    `  /radius set \$radiusEntry address=${radiusServerAddress} secret="${radiusSecret}" service=${radiusServices} authentication-port=1812 accounting-port=1813 timeout=1s`,
    '}',
  ]
  const baseUrl = new URL(completeUrl).origin
  const hotspotBundleFiles = ['certificates.rsc', 'config.rsc', 'hotspot-files.rsc', 'hotspot.rsc']
  const tenantQuery = tenantSlug && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(tenantSlug)
    ? `?tenant=${encodeURIComponent(tenantSlug)}`
    : ''
  const configScript = [
    ':local routerOsVersion [/system resource get version]',
    ':local versionDot [:find $routerOsVersion "."]',
    ':if ([:tonum [:pick $routerOsVersion 0 $versionDot]] < 7) do={:error "RouterOS 7.1 or newer is required"}',
    ':if ([:pick $routerOsVersion 0 3] = "7.0") do={:error "RouterOS 7.1 or newer is required"}',
    `/system identity set name="${safeName}"`,
    ...radiusClientCommands,
    ':local inventoryData ""',
    ':foreach interfaceId in=[/interface ethernet find] do={',
    '  :local interfaceName [/interface ethernet get $interfaceId name]',
    '  :local interfaceRunning [/interface ethernet get $interfaceId running]',
    '  :local interfaceDisabled [/interface ethernet get $interfaceId disabled]',
    '  :set inventoryData ($inventoryData . "I|" . $interfaceName . "|" . $interfaceRunning . "|" . $interfaceDisabled . ";")',
    '}',
    ':foreach bridgePortId in=[/interface bridge port find] do={',
    '  :local portInterface [/interface bridge port get $bridgePortId interface]',
    '  :local portBridge [/interface bridge port get $bridgePortId bridge]',
    '  :set inventoryData ($inventoryData . "P|" . $portInterface . "|" . $portBridge . ";")',
    '}',
    ':foreach dhcpClientId in=[/ip dhcp-client find where status="bound"] do={',
    '  :local wanInterface [/ip dhcp-client get $dhcpClientId interface]',
    '  :set inventoryData ($inventoryData . "W|" . $wanInterface . ";")',
    '}',
    ':foreach bridgeId in=[/interface bridge find] do={',
    '  :local bridgeName [/interface bridge get $bridgeId name]',
    '  :set inventoryData ($inventoryData . "B|" . $bridgeName . ";")',
    '}',
    `/tool fetch url="${completeUrl}" http-method=post http-data=$inventoryData http-header-field="content-type:text/plain" keep-result=no`,
    ...hotspotBundleFiles.flatMap((fileName) => [
      `/tool fetch url="${baseUrl}/hotspot/${fileName}${fileName === 'hotspot-files.rsc' ? tenantQuery : ''}" dst-path=${fileName} keep-result=yes`,
      ':delay 2s',
      `/import ${fileName}`,
    ]),
    `/tool fetch url="${completeUrl}" keep-result=no`,
  ]

  return configScript.join('\n')
}

const hotspotBundleScripts: Record<string, string> = {
  'certificates.rsc': [
    '# certificates.rsc',
    '# The billing portal uses HTTP-CHAP and does not require a router TLS certificate.',
    '# HTTPS login must not be enabled until a matching certificate is installed.',
    '',
  ].join('\n'),
  'config.rsc': [
    '# config.rsc',
    ':if ([:len [/radius find where comment="billing-system-managed"]] = 0) do={:error "Billing RADIUS client is missing"}',
    ':put "Billing RADIUS client is ready"',
    '',
  ].join('\n'),
  'hotspot-files.rsc': '',
  'hotspot.rsc': [
    '# hotspot.rsc',
    ':local hotspotDirectory "hotspot"',
    ':if ([:len [/file find where name="flash"]] > 0) do={:set hotspotDirectory "flash/hotspot"}',
    ':if ([:len [/ip hotspot profile find where name="billing-hotspot-profile"]] = 0) do={',
    '  /ip hotspot profile add name="billing-hotspot-profile" html-directory=$hotspotDirectory login-by=http-chap use-radius=yes radius-accounting=yes radius-interim-update=5m',
    '} else={',
    '  /ip hotspot profile set [find where name="billing-hotspot-profile"] html-directory=$hotspotDirectory login-by=http-chap use-radius=yes radius-accounting=yes radius-interim-update=5m',
    '}',
    '',
  ].join('\n'),
}

const hotspotAssetNames = ['login.html', 'status.html', 'logout.html', 'error.html', 'alogin.html', 'api.json', 'style.css', 'md5.js']

export function getHotspotBundleScript(fileName: string, assetBaseUrl = 'https://billing.lktech.life', tenantSlug = ''): string | null {
  const normalizedName = String(fileName || '').trim().toLowerCase()
  if (normalizedName === 'hotspot-files.rsc') {
    const assetBase = new URL('/hotspot-assets/', assetBaseUrl).toString()
    const validTenantSlug = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(tenantSlug) ? tenantSlug : ''
    const fetchAssets = (directory: string) => hotspotAssetNames.map((assetName) => {
      const assetUrl = assetName === 'login.html'
        ? new URL('/api/hotspot/portal-login', assetBaseUrl)
        : new URL(assetName, assetBase)
      if (assetName === 'login.html' && validTenantSlug) assetUrl.searchParams.set('tenant', validTenantSlug)
      return `/tool fetch url="${assetUrl.toString()}" dst-path="${directory}/${assetName}" keep-result=yes`
    })
    return [
      '# hotspot-files.rsc',
      ':if ([:len [/file find where name="flash"]] > 0) do={',
      ':if ([:len [/file find where name="flash/hotspot"]] = 0) do={/file add name="flash/hotspot" type=directory}',
      ...fetchAssets('flash/hotspot'),
      '} else={',
      ':if ([:len [/file find where name="hotspot"]] = 0) do={/file add name="hotspot" type=directory}',
      ...fetchAssets('hotspot'),
      '}',
      '',
    ].join('\n')
  }
  return hotspotBundleScripts[normalizedName] ?? null
}

export function selectRouterBridgeName(bridgeNames: string[]) {
  return bridgeNames.find((name) => ['lktech', 'lktech-bridge'].includes(name.trim().toLowerCase())) || bridgeNames[0] || null
}

export function parseServiceSubnet(value: string) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.0\/24$/.exec(value.trim())
  if (!match) return null
  const octets = match.slice(1).map(Number)
  if (octets.some((octet) => octet > 255)) return null
  const [first, second] = octets
  const isPrivate = first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
  if (!isPrivate) return null

  const base = `${octets[0]}.${octets[1]}.${octets[2]}`
  return { cidr: value.trim(), gateway: `${base}.1`, range: `${base}.2-${base}.254` }
}

export function buildSubscriberServiceScript({
  bridgeName,
  ports,
  services,
  hotspotAntiSharing = false,
  hotspotSubnet,
  pppoeSubnet,
}: {
  bridgeName: string
  ports: string[]
  services: string[]
  hotspotAntiSharing?: boolean
  hotspotSubnet?: string
  pppoeSubnet?: string
}) {
  if (!/^[a-zA-Z0-9_.-]{1,48}$/.test(bridgeName) || ports.some((port) => !/^[a-zA-Z0-9_.-]{1,48}$/.test(port))) {
    throw new Error('Bridge or interface name is invalid.')
  }

  const usesHotspot = services.includes('Hotspot')
  const usesPppoe = services.includes('PPPoE')
  const hotspotNetwork = usesHotspot ? parseServiceSubnet(hotspotSubnet || '') : null
  const pppoeNetwork = usesPppoe ? parseServiceSubnet(pppoeSubnet || '') : null
  if (usesHotspot && !hotspotNetwork) throw new Error('Hotspot network must be a private IPv4 /24, for example 172.31.0.0/24.')
  if (usesPppoe && !pppoeNetwork) throw new Error('PPPoE pool must be a private IPv4 /24, for example 172.31.1.0/24.')
  if (hotspotNetwork && pppoeNetwork && hotspotNetwork.cidr === pppoeNetwork.cidr) {
    throw new Error('Hotspot and PPPoE must use different /24 networks.')
  }

  const commands: string[] = []
  if (usesHotspot) {
    commands.push(
      `:if ([:len [/ip dhcp-server find where interface="${bridgeName}" and name!="billing-hotspot-dhcp"]] > 0) do={:error "A DHCP server already exists on ${bridgeName}; reconcile it before enabling the managed Hotspot DHCP server"}`,
      `:if ([:len [/ip hotspot find where interface="${bridgeName}" and name!="billing-hotspot"]] > 0) do={:error "A Hotspot server already exists on ${bridgeName}; reconcile it before enabling the managed Hotspot server"}`,
      `:if ([:len [/ip address find where interface="${bridgeName}" and address!="${hotspotNetwork!.gateway}/24"]] > 0) do={:error "${bridgeName} already has another IP address; reconcile it before enabling Hotspot"}`,
      `:if ([:len [/ip address find where address="${hotspotNetwork!.gateway}/24" and interface!="${bridgeName}"]] > 0) do={:error "Hotspot gateway address is already used on another interface"}`,
    )
  }
  if (usesPppoe) {
    commands.push(
      `:if ([:len [/interface pppoe-server server find where interface="${bridgeName}" and service-name!="billing-pppoe"]] > 0) do={:error "A PPPoE server already exists on ${bridgeName}; reconcile it before enabling the managed PPPoE server"}`,
    )
  }

  commands.push(`:if ([:len [/interface bridge find where name="${bridgeName}"]] = 0) do={/interface bridge add name="${bridgeName}"}`)
  for (const port of ports) {
    commands.push(
      `:if ([:len [/interface bridge port find where interface="${port}" and bridge!="${bridgeName}"]] > 0) do={:error "Refusing to move ${port}; it already belongs to another bridge"}`,
      `:if ([:len [/ip dhcp-client find where interface="${port}" and status="bound"]] > 0) do={:error "Refusing to bridge active DHCP uplink ${port}"}`,
      `:if ([:len [/interface bridge port find where interface="${port}"]] = 0) do={/interface bridge port add bridge="${bridgeName}" interface="${port}"}`,
    )
  }

  if (hotspotNetwork) {
    commands.push(
      `:if ([:len [/ip address find where interface="${bridgeName}" and address="${hotspotNetwork.gateway}/24"]] = 0) do={/ip address add address="${hotspotNetwork.gateway}/24" interface="${bridgeName}" comment="billing-system-managed-hotspot"}`,
      `:if ([:len [/ip pool find where name="billing-hotspot-pool"]] = 0) do={/ip pool add name="billing-hotspot-pool" ranges="${hotspotNetwork.range}"} else={/ip pool set [find where name="billing-hotspot-pool"] ranges="${hotspotNetwork.range}"}`,
      `:if ([:len [/ip dhcp-server network find where address="${hotspotNetwork.cidr}"]] = 0) do={/ip dhcp-server network add address="${hotspotNetwork.cidr}" gateway="${hotspotNetwork.gateway}" dns-server=1.1.1.1,8.8.8.8}`,
      `:if ([:len [/ip dhcp-server find where name="billing-hotspot-dhcp"]] = 0) do={/ip dhcp-server add name="billing-hotspot-dhcp" interface="${bridgeName}" address-pool="billing-hotspot-pool" lease-time=1h disabled=no} else={/ip dhcp-server set [find where name="billing-hotspot-dhcp"] interface="${bridgeName}" address-pool="billing-hotspot-pool" lease-time=1h disabled=no}`,
      ':local hotspotDirectory "hotspot"',
      ':if ([:len [/file find where name="flash"]] > 0) do={:set hotspotDirectory "flash/hotspot"}',
      `:if ([:len [/ip hotspot profile find where name="billing-hotspot-profile"]] = 0) do={/ip hotspot profile add name="billing-hotspot-profile" html-directory=$hotspotDirectory hotspot-address="${hotspotNetwork.gateway}" login-by=http-chap use-radius=yes radius-accounting=yes radius-interim-update=5m} else={/ip hotspot profile set [find where name="billing-hotspot-profile"] html-directory=$hotspotDirectory hotspot-address="${hotspotNetwork.gateway}" login-by=http-chap use-radius=yes radius-accounting=yes radius-interim-update=5m}`,
      `:if ([:len [/ip hotspot find where name="billing-hotspot"]] = 0) do={/ip hotspot add name="billing-hotspot" interface="${bridgeName}" address-pool=none profile="billing-hotspot-profile" disabled=no} else={/ip hotspot set [find where name="billing-hotspot"] interface="${bridgeName}" address-pool=none profile="billing-hotspot-profile" disabled=no}`,
      `:if ([:len [/ip firewall nat find where comment="billing-system-managed-hotspot-nat"]] = 0) do={/ip firewall nat add chain=srcnat action=masquerade src-address="${hotspotNetwork.cidr}" comment="billing-system-managed-hotspot-nat"}`,
      ':if ([:len [/ip hotspot walled-garden find where dst-host="billing.lktech.life" and action="allow"]] = 0) do={/ip hotspot walled-garden add dst-host="billing.lktech.life" action=allow comment="billing-system-managed-portal"}',
    )
  }

  if (hotspotNetwork && hotspotAntiSharing) {
    commands.push(
      `:if ([:len [/ip firewall mangle find where comment="billing-system-managed-hotspot-anti-sharing"]] = 0) do={/ip firewall mangle add chain=postrouting out-interface="${bridgeName}" dst-address="${hotspotNetwork.cidr}" action=change-ttl new-ttl=set:1 comment="billing-system-managed-hotspot-anti-sharing"} else={/ip firewall mangle set [find where comment="billing-system-managed-hotspot-anti-sharing"] chain=postrouting out-interface="${bridgeName}" dst-address="${hotspotNetwork.cidr}" action=change-ttl new-ttl=set:1}`,
    )
  } else {
    commands.push(':if ([:len [/ip firewall mangle find where comment="billing-system-managed-hotspot-anti-sharing"]] > 0) do={/ip firewall mangle remove [find where comment="billing-system-managed-hotspot-anti-sharing"]}')
  }

  if (pppoeNetwork) {
    commands.push(
      `:if ([:len [/ip pool find where name="billing-pppoe-pool"]] = 0) do={/ip pool add name="billing-pppoe-pool" ranges="${pppoeNetwork.range}"} else={/ip pool set [find where name="billing-pppoe-pool"] ranges="${pppoeNetwork.range}"}`,
      `:if ([:len [/ppp profile find where name="billing-pppoe-profile"]] = 0) do={/ppp profile add name="billing-pppoe-profile" local-address="${pppoeNetwork.gateway}" remote-address="billing-pppoe-pool" only-one=yes change-tcp-mss=yes} else={/ppp profile set [find where name="billing-pppoe-profile"] local-address="${pppoeNetwork.gateway}" remote-address="billing-pppoe-pool" only-one=yes change-tcp-mss=yes}`,
      '/ppp aaa set use-radius=yes accounting=yes interim-update=5m',
      `:if ([:len [/interface pppoe-server server find where service-name="billing-pppoe" and interface="${bridgeName}"]] = 0) do={/interface pppoe-server server add service-name="billing-pppoe" interface="${bridgeName}" default-profile="billing-pppoe-profile" authentication=pap,chap,mschap1,mschap2 one-session-per-host=yes disabled=no} else={/interface pppoe-server server set [find where service-name="billing-pppoe" and interface="${bridgeName}"] default-profile="billing-pppoe-profile" authentication=pap,chap,mschap1,mschap2 one-session-per-host=yes disabled=no}`,
    )
  }

  return commands.join('; ')
}

export function buildFetchCommand({ scriptUrl, completeUrl }: { scriptUrl: string; completeUrl?: string }) {
  void completeUrl
  const protocol = /^https:/i.test(scriptUrl) ? 'https' : 'http'
  return `/tool fetch mode=${protocol} url="${scriptUrl}" dst-path=lktech.rsc; :delay 2s; /import lktech.rsc`
}

export function buildServiceConfigFetchCommand({ scriptUrl, configuredUrl }: { scriptUrl: string; configuredUrl: string }) {
  return `/tool fetch url="${scriptUrl}" dst-path=billing-services.rsc; :delay 2s; /import billing-services.rsc; /tool fetch url="${configuredUrl}" keep-result=no`
}
