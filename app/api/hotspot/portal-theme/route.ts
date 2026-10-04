import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hotspotPortalSettings } from '@/lib/db/schema'
import { hotspotPortalTemplates } from '@/lib/hotspot-templates'
import { resolvePublicTenantId } from '@/lib/db/tenant'

const headers = {
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
  'content-type': 'text/css; charset=utf-8',
  'x-content-type-options': 'nosniff',
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = await resolvePublicTenantId(request)
    if (!tenantId) return new NextResponse('Workspace not found.', { status: 404, headers })
    const [settings] = await db.select({ activeTemplate: hotspotPortalSettings.activeTemplate })
      .from(hotspotPortalSettings)
      .where(and(eq(hotspotPortalSettings.tenantId, tenantId), eq(hotspotPortalSettings.id, 1)))
      .limit(1)
    const template = hotspotPortalTemplates.find((item) => item.id === settings?.activeTemplate) || hotspotPortalTemplates[0]
    const css = template.stylesheet
      ? await readFile(join(process.cwd(), 'public', 'hotspot-assets', 'themes', template.stylesheet), 'utf8')
      : ''
    return new NextResponse(css, { headers })
  } catch {
    return new NextResponse('', { status: 503, headers })
  }
}

export const dynamic = 'force-dynamic'