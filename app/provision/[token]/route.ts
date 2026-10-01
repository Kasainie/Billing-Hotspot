import { createHash } from 'node:crypto'
import { and, eq, gt, isNotNull, lt, ne, or } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { routerProvisioningTokens } from '@/lib/db/schema'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function notFound() {
  return new Response('Provisioning script not found or expired.', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })
}

export async function GET(_request: NextRequest, context: RouteContext<'/provision/[token]'>) {
  const { token } = await context.params
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return notFound()

  try {
    await db.update(routerProvisioningTokens)
      .set({ status: 'expired', configScript: null })
      .where(and(
        eq(routerProvisioningTokens.tokenHash, hashToken(token)),
        lt(routerProvisioningTokens.expiresAt, new Date()),
        ne(routerProvisioningTokens.status, 'applied'),
        isNotNull(routerProvisioningTokens.configScript),
      ))

    const script = await db.transaction(async (tx) => {
      const [record] = await tx.select().from(routerProvisioningTokens)
        .where(and(
          eq(routerProvisioningTokens.tokenHash, hashToken(token)),
          gt(routerProvisioningTokens.expiresAt, new Date()),
          isNotNull(routerProvisioningTokens.configScript),
          or(eq(routerProvisioningTokens.status, 'pending'), eq(routerProvisioningTokens.status, 'downloaded')),
        ))
        .for('update')
        .limit(1)
      if (!record?.configScript) return null

      const forwardedFor = _request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      await tx.update(routerProvisioningTokens)
        .set({ status: 'downloaded', downloadedAt: new Date(), sourceIp: forwardedFor || record.sourceIp })
        .where(eq(routerProvisioningTokens.id, record.id))
      return record.configScript
    })

    if (!script) return notFound()
    return new Response(script, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store, private',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    })
  } catch {
    return new Response('Unable to retrieve the provisioning script.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    })
  }
}

export const dynamic = 'force-dynamic'