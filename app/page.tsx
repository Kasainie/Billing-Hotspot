import AdminDashboard from '@/components/admin-dashboard'
import { getTenantSession } from '@/lib/db/tenant'
import { redirect } from 'next/navigation'

export default async function Page() {
  if (!process.env.DATABASE_URL?.trim() || !(await getTenantSession())) redirect('/login')
  return <AdminDashboard />
}
