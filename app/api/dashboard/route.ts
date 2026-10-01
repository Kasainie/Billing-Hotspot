import { NextResponse } from 'next/server'
import { desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, packages, payments, sites } from '@/lib/db/schema'

const fallbackData = {
  sites: [
    { id: 'site-1', name: 'Central Hub', location: 'Accra Central', status: 'active', customersCount: 184, monthlyRevenue: 8600, createdAt: new Date().toISOString() },
    { id: 'site-2', name: 'North Ridge', location: 'Tema', status: 'active', customersCount: 96, monthlyRevenue: 5100, createdAt: new Date().toISOString() },
    { id: 'site-3', name: 'Lakeside Estate', location: 'East Legon', status: 'maintenance', customersCount: 72, monthlyRevenue: 3900, createdAt: new Date().toISOString() },
  ],
  customers: [
    { id: 'customer-1', siteId: 'site-1', name: 'Amina Yusuf', email: 'amina@example.com', phone: '+233245000000', status: 'active', plan: 'Pro 50', monthlyRate: 240, expiresAt: new Date(Date.now() + 86400000 * 20).toISOString(), createdAt: new Date().toISOString() },
    { id: 'customer-2', siteId: 'site-2', name: 'Daniel Osei', email: 'daniel@example.com', phone: '+233245000001', status: 'active', plan: 'Home 20', monthlyRate: 120, expiresAt: new Date(Date.now() + 86400000 * 12).toISOString(), createdAt: new Date().toISOString() },
    { id: 'customer-3', siteId: 'site-3', name: 'Grace Boateng', email: 'grace@example.com', phone: '+233245000002', status: 'active', plan: 'Starter 10', monthlyRate: 80, expiresAt: new Date(Date.now() + 86400000 * 9).toISOString(), createdAt: new Date().toISOString() },
  ],
  payments: [
    { id: 'payment-1', customerId: 'customer-1', amount: 240, status: 'paid', method: 'Mobile Money', paidAt: new Date().toISOString(), reference: 'PAY-84521' },
    { id: 'payment-2', customerId: 'customer-2', amount: 120, status: 'paid', method: 'Card', paidAt: new Date().toISOString(), reference: 'PAY-84520' },
    { id: 'payment-3', customerId: 'customer-3', amount: 80, status: 'pending', method: 'Mobile Money', paidAt: new Date().toISOString(), reference: 'PAY-84519' },
  ],
  packages: [
    { id: 'package-1', name: 'Starter 10', downloadMbps: 10, uploadMbps: 5, monthlyPrice: 80, active: true, createdAt: new Date().toISOString() },
    { id: 'package-2', name: 'Home 20', downloadMbps: 20, uploadMbps: 10, monthlyPrice: 120, active: true, createdAt: new Date().toISOString() },
    { id: 'package-3', name: 'Pro 50', downloadMbps: 50, uploadMbps: 25, monthlyPrice: 240, active: true, createdAt: new Date().toISOString() },
  ],
}

export async function GET() {
  const hasDatabase = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim())

  if (!hasDatabase) {
    return NextResponse.json(fallbackData)
  }

  try {
    const [siteRows, customerRows, paymentRows, packageRows] = await Promise.all([
      db.select().from(sites).orderBy(desc(sites.createdAt)),
      db.select().from(customers).orderBy(desc(customers.createdAt)).limit(100),
      db.select().from(payments).orderBy(desc(payments.paidAt)).limit(100),
      db.select().from(packages).orderBy(desc(packages.createdAt)),
    ])
    return NextResponse.json({ sites: siteRows, customers: customerRows, payments: paymentRows, packages: packageRows })
  } catch {
    return NextResponse.json(fallbackData)
  }
}
