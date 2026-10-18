import { sql } from 'drizzle-orm'

export function tenantSessionUserFilter(tenantId: string) {
  return sql`(
    exists (
      select 1
      from public.hotspot_purchases as purchase
      where purchase.tenant_id = ${tenantId}
        and purchase.radius_username = accounting.username
        and purchase.status = 'completed'
    )
    or exists (
      select 1
      from public.vouchers as voucher
      inner join public.packages as plan
        on plan.id = voucher.package_id
        and plan.tenant_id = voucher.tenant_id
      where voucher.tenant_id = ${tenantId}
        and voucher.username = accounting.username
        and plan.type in ('Hotspot', 'Bundle', 'Trial')
    )
    or exists (
      select 1
      from public.customers as customer
      where customer.tenant_id = ${tenantId}
        and customer.radius_username = accounting.username
    )
  )`
}
