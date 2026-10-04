import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hotspotPortalSettings } from '@/lib/db/schema'
import { getTenantSession, resolvePublicTenantId } from '@/lib/db/tenant'
import { defaultHotspotPortalBranding, isHotspotPortalTemplateId } from '@/lib/hotspot-templates'

const publicHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
}

function cleanBrandingText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned && cleaned.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(cleaned) ? cleaned : null
}

export async function GET(request: NextRequest) {
  try {
    const session = await getTenantSession(request)
    const tenantId = session?.tenantId || await resolvePublicTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404, headers: publicHeaders })
    const [settings] = await db.select({
      activeTemplate: hotspotPortalSettings.activeTemplate,
      companyName: hotspotPortalSettings.companyName,
      welcomeHeadline: hotspotPortalSettings.welcomeHeadline,
      welcomeMessage: hotspotPortalSettings.welcomeMessage,
      supportMessage: hotspotPortalSettings.supportMessage,
    })
      .from(hotspotPortalSettings)
      .where(and(eq(hotspotPortalSettings.tenantId, tenantId), eq(hotspotPortalSettings.id, 1)))
      .limit(1)
    return NextResponse.json({
      activeTemplate: settings?.activeTemplate || 'original',
      companyName: settings?.companyName || defaultHotspotPortalBranding.companyName,
      welcomeHeadline: settings?.welcomeHeadline || defaultHotspotPortalBranding.welcomeHeadline,
      welcomeMessage: settings?.welcomeMessage || defaultHotspotPortalBranding.welcomeMessage,
      supportMessage: settings?.supportMessage || defaultHotspotPortalBranding.supportMessage,
    }, { headers: publicHeaders })
  } catch {
    return NextResponse.json({ error: 'Unable to load portal settings.' }, { status: 503, headers: publicHeaders })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to update portal settings.' }, { status: 401 })
  let input: { template?: unknown; companyName?: unknown; welcomeHeadline?: unknown; welcomeMessage?: unknown; supportMessage?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Portal settings are invalid.' }, { status: 400 })
  }
  const updates: {
    activeTemplate?: (typeof hotspotPortalSettings.$inferInsert)['activeTemplate']
    companyName?: string
    welcomeHeadline?: string
    welcomeMessage?: string
    supportMessage?: string
  } = {}
  if (input.template !== undefined) {
    if (!isHotspotPortalTemplateId(input.template)) return NextResponse.json({ error: 'Choose a valid portal template.' }, { status: 400 })
    updates.activeTemplate = input.template
  }
  const brandingFields = [
    ['companyName', input.companyName, 48],
    ['welcomeHeadline', input.welcomeHeadline, 80],
    ['welcomeMessage', input.welcomeMessage, 180],
    ['supportMessage', input.supportMessage, 120],
  ] as const
  for (const [field, value, maxLength] of brandingFields) {
    if (value === undefined) continue
    const cleaned = cleanBrandingText(value, maxLength)
    if (!cleaned) return NextResponse.json({ error: `${field} must be 1-${maxLength} characters.` }, { status: 400 })
    updates[field] = cleaned
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Choose a valid portal template.' }, { status: 400 })
  }

  try {
    const [settings] = await db.insert(hotspotPortalSettings).values({ tenantId: session.tenantId, id: 1, ...updates })
      .onConflictDoUpdate({
        target: [hotspotPortalSettings.tenantId, hotspotPortalSettings.id],
        set: { ...updates, updatedAt: new Date() },
      })
      .returning({
        activeTemplate: hotspotPortalSettings.activeTemplate,
        companyName: hotspotPortalSettings.companyName,
        welcomeHeadline: hotspotPortalSettings.welcomeHeadline,
        welcomeMessage: hotspotPortalSettings.welcomeMessage,
        supportMessage: hotspotPortalSettings.supportMessage,
      })
    return NextResponse.json(settings, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to save portal settings.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'