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
    const [kind, ...fields] = record.split('|')
    if (kind === 'I' && fields.length === 3) {
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
  const configScript = [
    ':local routerOsVersion [/system resource get version]',
    ':local versionDot [:find $routerOsVersion "."]',
    ':if ([:tonum [:pick $routerOsVersion 0 $versionDot]] < 6) do={:error "RouterOS 6.0 or newer is required"}',
    `/system identity set name="${safeName}"`,
    ...radiusClientCommands,
    ':local routerInventoryData ""',
    ':local inventorySeparator ""',
    ':foreach interfaceId in=[/interface ethernet find] do={',
    '  :local interfaceName [/interface ethernet get $interfaceId name]',
    '  :if ($interfaceName ~ "^[a-zA-Z0-9_.-]{1,48}$") do={',
    '    :local interfaceRunning [/interface ethernet get $interfaceId running]',
    '    :local interfaceDisabled [/interface ethernet get $interfaceId disabled]',
    '    :set routerInventoryData ($routerInventoryData . $inventorySeparator . "I|" . $interfaceName . "|" . [:tostr $interfaceRunning] . "|" . [:tostr $interfaceDisabled])',
    '    :set inventorySeparator ";"',
    '  }',
    '}',
    ':foreach bridgePortId in=[/interface bridge port find] do={',
    '  :local portInterface [/interface bridge port get $bridgePortId interface]',
    '  :local portBridge [/interface bridge port get $bridgePortId bridge]',
    '  :if (($portInterface ~ "^[a-zA-Z0-9_.-]{1,48}$") && ($portBridge ~ "^[a-zA-Z0-9_.-]{1,48}$")) do={',
    '    :set routerInventoryData ($routerInventoryData . $inventorySeparator . "P|" . $portInterface . "|" . $portBridge)',
    '    :set inventorySeparator ";"',
    '  }',
    '}',
    ':foreach dhcpClientId in=[/ip dhcp-client find where status="bound"] do={',
    '  :local wanInterface [/ip dhcp-client get $dhcpClientId interface]',
    '  :if ($wanInterface ~ "^[a-zA-Z0-9_.-]{1,48}$") do={',
    '    :set routerInventoryData ($routerInventoryData . $inventorySeparator . "W|" . $wanInterface)',
    '    :set inventorySeparator ";"',
    '  }',
    '}',
    ':foreach bridgeId in=[/interface bridge find] do={',
    '  :local bridgeName [/interface bridge get $bridgeId name]',
    '  :if ($bridgeName ~ "^[a-zA-Z0-9_.-]{1,48}$") do={',
    '    :set routerInventoryData ($routerInventoryData . $inventorySeparator . "B|" . $bridgeName)',
    '    :set inventorySeparator ";"',
    '  }',
    '}',
    `/tool fetch url="${completeUrl}" http-method=post http-data=$routerInventoryData http-header-field="content-type: text/plain" keep-result=no`,
    `/tool fetch url="${completeUrl}" keep-result=no`,
  ]

  return configScript.join('\n')
}

const hotspotBundleScripts: Record<string, string> = {
  'certificates.rsc': [
    '# certificates.rsc',
    '# This bundle is intentionally empty so RouterOS can complete the fetch/import chain without 404 errors.',
    '# The billing system handles certificate setup from the main provisioning script.',
    '',
  ].join('\n'),
  'config.rsc': [
    '# config.rsc',
    '# This bundle is intentionally empty so RouterOS can complete the fetch/import chain without 404 errors.',
    '# The billing system manages configuration through the main provisioning script.',
    '',
  ].join('\n'),
  'hotspot-files.rsc': [
    '# hotspot-files.rsc',
    '# This bundle is intentionally empty so RouterOS can complete the fetch/import chain without 404 errors.',
    '# The billing system manages hotspot files from the main provisioning script.',
    '',
  ].join('\n'),
  'hotspot.rsc': [
    '# hotspot.rsc',
    '# This bundle is intentionally empty so RouterOS can complete the fetch/import chain without 404 errors.',
    '# The billing system manages hotspot configuration from the main provisioning script.',
    '',
  ].join('\n'),
}

export function getHotspotBundleScript(fileName: string): string | null {
  const normalizedName = String(fileName || '').trim().toLowerCase()
  return hotspotBundleScripts[normalizedName] ?? null
}

export function buildFetchCommand({ scriptUrl, completeUrl }: { scriptUrl: string; completeUrl?: string }) {
  void completeUrl
  const protocol = /^https:/i.test(scriptUrl) ? 'https' : 'http'
  const base = scriptUrl.replace(/\/provision\/.+$/, '')

  const bundle = [
    `/tool fetch mode=${protocol} url="${scriptUrl}" dst-path=lktech.rsc`,
    ':delay 2s',
    '/import lktech.rsc',
    `/tool fetch mode=${protocol} url="${base}/hotspot/certificates.rsc" dst-path=certificates.rsc`,
    ':delay 2s',
    '/import certificates.rsc',
    `/tool fetch mode=${protocol} url="${base}/hotspot/config.rsc" dst-path=config.rsc`,
    ':delay 2s',
    '/import config.rsc',
    `/tool fetch mode=${protocol} url="${base}/hotspot/hotspot-files.rsc" dst-path=hotspot-files.rsc`,
    ':delay 2s',
    '/import hotspot-files.rsc',
    `/tool fetch mode=${protocol} url="${base}/hotspot/hotspot.rsc" dst-path=hotspot.rsc`,
    ':delay 2s',
    '/import hotspot.rsc',
  ]

  return bundle.join('; ')
}
