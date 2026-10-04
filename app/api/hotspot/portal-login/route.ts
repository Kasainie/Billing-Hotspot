import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { resolvePublicTenantId } from '@/lib/db/tenant'

export async function GET(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get('tenant')?.trim().toLowerCase() || ''
  if (tenantSlug && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(tenantSlug)) {
    return NextResponse.json({ error: 'Workspace slug is invalid.' }, { status: 400 })
  }

  try {
    const tenantId = await resolvePublicTenantId(request)
    if (!tenantId) return new Response('Workspace not found.', { status: 404, headers: { 'cache-control': 'no-store' } })
    const template = await readFile(join(process.cwd(), 'public', 'hotspot-assets', 'login.html'), 'utf8')
    const marker = "var portalTenantSlug = '';"
    if (!template.includes(marker)) throw new Error('Captive portal tenant marker is missing.')
    const html = template.replace(marker, `var portalTenantSlug = ${JSON.stringify(tenantSlug)};`)
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    })
  } catch (error) {
    console.error('Unable to prepare tenant captive portal login page', error)
    return new Response('Captive portal is temporarily unavailable.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    })
  }
}

export const dynamic = 'force-dynamic'
