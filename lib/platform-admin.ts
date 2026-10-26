import { NextRequest, NextResponse } from 'next/server'
import { getTenantSession, type TenantSession } from '@/lib/db/tenant'
import { getPlatformAdminEmails, isPlatformAdminEmail } from '@/lib/platform-admin-access'
import { requirePasswordConfirmation } from '@/lib/db/password-confirmation'

export { getPlatformAdminEmails, isPlatformAdminEmail } from '@/lib/platform-admin-access'

export async function requirePlatformAdmin(request: NextRequest): Promise<
  { session: TenantSession; response?: never } |
  { session?: never; response: NextResponse }
> {
  if (!getPlatformAdminEmails().size) {
    return { response: NextResponse.json({ error: 'Platform administration is not configured.' }, { status: 503 }) }
  }

  const session = await getTenantSession(request)
  if (!session) {
    return { response: NextResponse.json({ error: 'Sign in to manage the platform.' }, { status: 401 }) }
  }
  if (!isPlatformAdminEmail(session.email)) {
    return { response: NextResponse.json({ error: 'Platform administrator access is required.' }, { status: 403 }) }
  }

  const confirmationResponse = await requirePasswordConfirmation(request, session.userId)
  if (confirmationResponse) return { response: confirmationResponse }
  return { session }
}
