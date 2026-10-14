import AdminDashboard from '@/components/admin-dashboard'
import { MarketingHome } from '@/components/marketing-home'
import { getTenantSession } from '@/lib/db/tenant'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Hotspot and ISP Billing Software',
  description: 'Manage hotspot and PPPoE billing, subscriber access, M-Pesa payments, and MikroTik network operations with LKTECH.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Hotspot and ISP Billing Software',
    description: 'Manage hotspot and PPPoE billing, subscriber access, M-Pesa payments, and MikroTik network operations with LKTECH.',
    url: '/',
  },
}

export default async function Page() {
  if (process.env.DATABASE_URL?.trim() && await getTenantSession()) return <AdminDashboard />
  return <MarketingHome />
}
