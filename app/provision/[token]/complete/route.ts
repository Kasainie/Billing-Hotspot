import { createHash } from 'node:crypto'
import { and, eq, gt, isNotNull, ne } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { readRouterInventoryPayload, selectRouterBridgeName } from '@/lib/router-provisioning'
import { routerProvisioningTokens } from '@/lib/db/schema'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>)
  return []
}

function getStringValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
  }
  return null
}

function toBoolean(value: unknown) {
  return value === true || value === 'true' || value === 'yes' || value === '1' || value === 1
}

function asKeyValueMap(value: unknown) {
  if (!Array.isArray(value)) return new Map<string, unknown>()
  const map = new Map<string, unknown>()
  for (let index = 0; index < value.length - 1; index += 2) {
    const key = typeof value[index] === 'string' ? value[index].trim() : ''
    if (!key || !/^(name|interface|bridge|port|running|disabled)$/.test(key)) continue
    map.set(key, value[index + 1])
  }
  return map
}

function parseNameList(value: unknown, key: 'name' | 'interface') {
  return asArray(value).flatMap((item) => {
    if (typeof item === 'string') {
      const name = item.trim()
      return name && /^[a-zA-Z0-9_.-]{1,48}$/.test(name) ? [name] : []
    }
    if (Array.isArray(item)) {
      const map = asKeyValueMap(item)
      const name = getStringValue(Object.fromEntries(map), key, 'name', 'interface')
      return name && /^[a-zA-Z0-9_.-]{1,48}$/.test(name) ? [name] : []
    }
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const name = getStringValue(record, key, 'name', 'interface')
    return name && /^[a-zA-Z0-9_.-]{1,48}$/.test(name) ? [name] : []
  }).slice(0, 64)
}

function parseInterfaceList(value: unknown) {
  return asArray(value).flatMap((item) => {
    if (typeof item === 'string') {
      const name = item.trim()
      return name && /^[a-zA-Z0-9_.-]{1,48}$/.test(name) ? [{ name, running: false, disabled: false }] : []
    }
    if (Array.isArray(item)) {
      const map = asKeyValueMap(item)
      const name = getStringValue(Object.fromEntries(map), 'name', 'interface')
      if (!name || !/^[a-zA-Z0-9_.-]{1,48}$/.test(name)) return []
      return [{ name, running: toBoolean(map.get('running')), disabled: toBoolean(map.get('disabled')) }]
    }
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const name = getStringValue(record, 'name', 'interface')
    if (!name || !/^[a-zA-Z0-9_.-]{1,48}$/.test(name)) return []
    return [{ name, running: toBoolean(record.running), disabled: toBoolean(record.disabled) }]
  }).slice(0, 64)
}

function parseBridgePortList(value: unknown) {
  return asArray(value).flatMap((item) => {
    if (Array.isArray(item)) {
      const map = asKeyValueMap(item)
      const interfaceName = getStringValue(Object.fromEntries(map), 'interface', 'port')
      const bridgeName = getStringValue(Object.fromEntries(map), 'bridge')
      if (!interfaceName || !bridgeName || !/^[a-zA-Z0-9_.-]{1,48}$/.test(interfaceName) || !/^[a-zA-Z0-9_.-]{1,48}$/.test(bridgeName)) return []
      return [{ interface: interfaceName, bridge: bridgeName }]
    }
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const interfaceName = getStringValue(record, 'interface', 'port')
    const bridgeName = getStringValue(record, 'bridge')
    if (!interfaceName || !bridgeName || !/^[a-zA-Z0-9_.-]{1,48}$/.test(interfaceName) || !/^[a-zA-Z0-9_.-]{1,48}$/.test(bridgeName)) return []
    return [{ interface: interfaceName, bridge: bridgeName }]
  }).slice(0, 64)
}

export async function POST(request: NextRequest, context: RouteContext<'/provision/[token]/complete'>) {
  const { token } = await context.params
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return new Response('Invalid provisioning token.', { status: 404 })

  let input: Record<string, unknown>
  try {
    input = await readRouterInventoryPayload(request)
  } catch {
    return new Response('Invalid router inventory.', { status: 400 })
  }

  const interfaces = parseInterfaceList(input.interfaces)
  const bridgePorts = parseBridgePortList(input.bridgePorts)
  const wanInterfaces = parseNameList(input.wanInterfaces, 'interface')
  const bridgeNames = parseNameList(input.bridges, 'name')
  const routerData = {
    interfaces,
    bridgePorts,
    wanInterfaces,
    bridgeName: selectRouterBridgeName(bridgeNames),
  }

  try {
    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const [record] = await db.update(routerProvisioningTokens)
      .set({ routerData, sourceIp: forwardedFor || undefined })
      .where(and(
        eq(routerProvisioningTokens.tokenHash, hashToken(token)),
        gt(routerProvisioningTokens.expiresAt, new Date()),
        eq(routerProvisioningTokens.status, 'downloaded'),
        isNotNull(routerProvisioningTokens.configScript),
      ))
      .returning({ id: routerProvisioningTokens.id })

    if (!record) return new Response('Provisioning token not found or expired.', { status: 404 })
    return new Response('Router inventory received.', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    })
  } catch {
    return new Response('Unable to save router inventory.', { status: 503 })
  }
}

export async function GET(_request: NextRequest, context: RouteContext<'/provision/[token]/complete'>) {
  const { token } = await context.params
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return new Response('Invalid provisioning token.', { status: 404 })

  try {
    const forwardedFor = _request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const [record] = await db.update(routerProvisioningTokens)
      .set({ status: 'applied', appliedAt: new Date(), configScript: null, sourceIp: forwardedFor })
      .where(and(
        eq(routerProvisioningTokens.tokenHash, hashToken(token)),
        gt(routerProvisioningTokens.expiresAt, new Date()),
        ne(routerProvisioningTokens.status, 'applied'),
        isNotNull(routerProvisioningTokens.configScript),
      ))
      .returning({ id: routerProvisioningTokens.id })

    if (!record) return new Response('Provisioning token not found or expired.', { status: 404 })
    return new Response(null, {
      status: 204,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    })
  } catch {
    return new Response('Unable to confirm provisioning.', { status: 503 })
  }
}

export const dynamic = 'force-dynamic'