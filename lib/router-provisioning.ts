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
  return {}
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
}: {
  routerName: string
  radiusServerAddress: string
  radiusSecret: string
  completeUrl: string
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
  const configScript = [
    ':local routerOsVersion [/system resource get version]',
    ':local versionDot [:find $routerOsVersion "."]',
    ':if ([:tonum [:pick $routerOsVersion 0 $versionDot]] < 7) do={:error "RouterOS 7.1 or newer is required"}',
    ':if ([:pick $routerOsVersion 0 3] = "7.0") do={:error "RouterOS 7.1 or newer is required"}',
    `/system identity set name="${safeName}"`,
    ...radiusClientCommands,
    ':local routerInterfaces [/interface ethernet print as-value]',
    ':local currentBridgePorts [/interface bridge port print as-value]',
    ':local boundDhcpClients [/ip dhcp-client print as-value where status="bound"]',
    ':local currentBridges [/interface bridge print as-value]',
    ':local routerInventory {interfaces=$routerInterfaces;bridgePorts=$currentBridgePorts;wanInterfaces=$boundDhcpClients;bridges=$currentBridges}',
    ':local inventoryJson [:serialize to=json value=$routerInventory]',
    `/tool fetch url="${completeUrl}" http-method=post http-data=$inventoryJson http-header-field="content-type:application/json" keep-result=no`,
    ...hotspotBundleFiles.flatMap((fileName) => [
      `/tool fetch url="${baseUrl}/hotspot/${fileName}" dst-path=${fileName} keep-result=yes`,
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

export function getHotspotBundleScript(fileName: string, assetBaseUrl = 'https://billing.lktech.life'): string | null {
  const normalizedName = String(fileName || '').trim().toLowerCase()
  if (normalizedName === 'hotspot-files.rsc') {
    const assetBase = new URL('/hotspot-assets/', assetBaseUrl).toString()
    const fetchAssets = (directory: string) => hotspotAssetNames.map((assetName) => (
      `/tool fetch url="${assetBase}${assetName}" dst-path="${directory}/${assetName}" keep-result=yes`
    ))
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
  hotspotSubnet,
  pppoeSubnet,
}: {
  bridgeName: string
  ports: string[]
  services: string[]
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
    )
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

export function buildServiceConfigFetchCommand({ scriptUrl }: { scriptUrl: string }) {
  return `/tool fetch url="${scriptUrl}" dst-path=billing-services.rsc; :delay 2s; /import billing-services.rsc`
}
