import { NextRequest, NextResponse } from 'next/server'
import { getTenantSession, type TenantSession } from '@/lib/db/tenant'
import { canManageTenant } from '@/lib/db/tenant-role-access'
import { requirePasswordConfirmation } from '@/lib/db/password-confirmation'
import { isSensitiveAdminMutation } from '@/lib/db/admin-action-confirmation'

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
  if (!isSensitiveAdminMutation(new URL(request.url).pathname, request.method)) {
    const confirmationResponse = await requirePasswordConfirmation(request, session.userId)
    if (confirmationResponse) return { response: confirmationResponse }
  }
  return { session }
}
