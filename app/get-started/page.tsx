import { redirect } from 'next/navigation'
import GetStartedWizard from '@/components/get-started-wizard'
import { getTenantSession } from '@/lib/db/tenant'

export default async function GetStartedPage() {
  if (!process.env.DATABASE_URL?.trim() || !(await getTenantSession())) redirect('/login')
  return <GetStartedWizard />
}
