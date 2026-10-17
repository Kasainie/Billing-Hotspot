import { notFound, redirect } from 'next/navigation'
import { PlatformAdminDashboard } from '@/components/platform-admin-dashboard'
import { getTenantSession } from '@/lib/db/tenant'
import { isPlatformAdminEmail } from '@/lib/platform-admin'

export const dynamic = 'force-dynamic'

export default async function PlatformAdminPage() {
  const session = await getTenantSession()
  if (!session) redirect('/login')
  if (!isPlatformAdminEmail(session.email)) notFound()
  return <PlatformAdminDashboard adminEmail={session.email} />
}
