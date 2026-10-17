import { NextRequest, NextResponse } from 'next/server'
import { getTenantSession, type TenantSession } from '@/lib/db/tenant'
import { canManageTenant } from '@/lib/db/tenant-role-access'

export async function requireTenantAdmin(request: NextRequest): Promise<
  { session: TenantSession; response?: never } |
  { session?: never; response: NextResponse }
> {
  const session = await getTenantSession(request)
  if (!session) {
    return { response: NextResponse.json({ error: 'Sign in to manage this workspace.' }, { status: 401 }) }
  }
  if (!canManageTenant(session.role)) {
    return { response: NextResponse.json({ error: 'Workspace owner or admin access is required.' }, { status: 403 }) }
  }
  return { session }
}
