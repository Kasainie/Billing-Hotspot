import { createHash } from 'node:crypto'
import { and, eq, gt, isNotNull } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { routerProvisioningTokens } from '@/lib/db/schema'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function GET(request: NextRequest, context: RouteContext<'/provision/[token]/configured'>) {
  const { token } = await context.params
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return new Response('Invalid provisioning token.', { status: 404 })

  try {
    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const [record] = await db.update(routerProvisioningTokens)
      .set({ status: 'configured', configScript: null, sourceIp: forwardedFor })
      .where(and(
        eq(routerProvisioningTokens.tokenHash, hashToken(token)),
        eq(routerProvisioningTokens.status, 'applied'),
        gt(routerProvisioningTokens.expiresAt, new Date()),
        isNotNull(routerProvisioningTokens.configScript),
      ))
      .returning({ id: routerProvisioningTokens.id })

    if (!record) return new Response('Router configuration not found or expired.', { status: 404 })
    return new Response('Router services configured.', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    })
  } catch (error) {
    console.error('Unable to confirm router service configuration', error)
    return new Response('Unable to confirm router configuration.', { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
