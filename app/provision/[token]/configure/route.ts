import { createHash } from 'node:crypto'
import { and, eq, gt, isNotNull } from 'drizzle-orm'
import {
  buildSubscriberServiceScript,
  DEFAULT_ROUTER_BRIDGE_NAME,
  findWanBridgeConflict,
  findWanBridgeSubnetConflict,
  findWanSubnetConflict,
} from '@/lib/router-provisioning'
import { db } from '@/lib/db'
import { routerProvisioningTokens } from '@/lib/db/schema'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function GET(_request: Request, context: RouteContext<'/provision/[token]/configure'>) {
  const { token } = await context.params
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return new Response('Configuration file not found or expired.', { status: 404 })

  try {
    const [record] = await db.select({
      configScript: routerProvisioningTokens.configScript,
      routerData: routerProvisioningTokens.routerData,
    })
      .from(routerProvisioningTokens)
      .where(and(
        eq(routerProvisioningTokens.tokenHash, hashToken(token)),
        eq(routerProvisioningTokens.status, 'applied'),
        gt(routerProvisioningTokens.expiresAt, new Date()),
        isNotNull(routerProvisioningTokens.configScript),
      ))
      .limit(1)
    if (!record?.configScript) return new Response('Configuration file not found or expired.', { status: 404 })

    const routerData = record.routerData
    const configuration = routerData?.serviceConfiguration
    if (!routerData || !configuration) {
      return new Response('Service choices are missing. Prepare a new router service configuration in LKTECH.', { status: 409 })
    }

    const bridgeName = routerData.bridgeName || DEFAULT_ROUTER_BRIDGE_NAME
    const validNames = (names: unknown): names is string[] => Array.isArray(names) &&
      names.length > 0 &&
      names.length <= 64 &&
      names.every((name) => typeof name === 'string' && /^[a-zA-Z0-9_.-]{1,48}$/.test(name)) &&
      new Set(names).size === names.length
    const { ports, managedPorts, wanPorts, services } = configuration
    if (!validNames(ports) || !validNames(managedPorts) || !Array.isArray(wanPorts) ||
        wanPorts.length > 64 || !wanPorts.every((name) => typeof name === 'string' && /^[a-zA-Z0-9_.-]{1,48}$/.test(name)) ||
        new Set(wanPorts).size !== wanPorts.length ||
        !Array.isArray(services) || !services.length || services.length > 2 ||
        !services.every((service) => service === 'Hotspot' || service === 'PPPoE') ||
        (configuration.hotspotSubnet !== null && typeof configuration.hotspotSubnet !== 'string') ||
        (configuration.pppoeSubnet !== null && typeof configuration.pppoeSubnet !== 'string')) {
      return new Response('Saved service choices are invalid. Prepare a new router service configuration in LKTECH.', { status: 409 })
    }

    const wanInterfaces = routerData.wanInterfaces || []
    const protectedWanPorts = [...new Set([...wanInterfaces, ...wanPorts])]
    if (findWanBridgeConflict(bridgeName, wanInterfaces)) {
      return new Response(`Active WAN DHCP client is attached to ${bridgeName}, the selected subscriber bridge. Move WAN DHCP to its physical uplink and prepare services again.`, { status: 409 })
    }
    const interfaceNetworks = routerData.interfaceNetworks || []
    const bridgeWanConflict = findWanBridgeSubnetConflict(bridgeName, protectedWanPorts, interfaceNetworks)
    if (bridgeWanConflict) {
      return new Response(`Subscriber bridge ${bridgeName} still has an address in WAN network ${bridgeWanConflict.bridge.network}. Reconcile it before applying services.`, { status: 409 })
    }
    if (services.includes('Hotspot')) {
      const hotspotWanConflict = findWanSubnetConflict(configuration.hotspotSubnet || '', protectedWanPorts, interfaceNetworks)
      if (hotspotWanConflict) {
        return new Response(`Hotspot network overlaps WAN interface ${hotspotWanConflict.interface}. Choose a different private subnet.`, { status: 409 })
      }
    }

    let currentScript: string
    try {
      currentScript = buildSubscriberServiceScript({
        bridgeName,
        ports,
        managedPorts,
        wanPorts: protectedWanPorts,
        services,
        hotspotAntiSharing: configuration.hotspotAntiSharing,
        hotspotSubnet: configuration.hotspotSubnet || undefined,
        pppoeSubnet: configuration.pppoeSubnet || undefined,
      })
    } catch {
      return new Response('Saved service choices are no longer valid. Prepare a new router service configuration in LKTECH.', { status: 409 })
    }

    return new Response(currentScript, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store, private',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    })
  } catch {
    return new Response('Unable to retrieve the configuration file.', { status: 503 })
  }
}

export const dynamic = 'force-dynamic'