'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowDownToLine, CalendarClock, Clock3, MessageCircle, Minus, Plus, RefreshCw, ShieldCheck, Ticket, Trash2, X } from 'lucide-react'
import { KENYAN_MOBILE_PHONE_PATTERN } from '@/lib/kenyan-phone'
import { SUPPORT_TICKET_CATEGORIES, supportTicketCategoryLabel } from '@/lib/support-tickets'

type ModuleView = 'Leads' | 'Ticket list' | 'Ticket analytics' | 'Expenses' | 'Voucher list' | 'Generate vouchers' | 'Voucher analytics' | 'Equipment' | 'TR-069' | 'Invoices'
type Lead = { id: string; name: string; email: string | null; phone: string | null; location: string | null; coverageStatus: string; customerId: string | null; source: string | null; notes: string | null; status: string; createdAt: string }
type SubscriberPlan = { id: string; name: string; type: string; rateLimit: string; monthlyPrice: number; durationSeconds: number }
type SupportTicket = { id: string; requesterName: string; requesterEmail: string | null; subject: string; description: string; category: string; priority: string; status: string; assignedTo: string | null; createdAt: string; updatedAt: string }
type Expense = { id: string; category: string; description: string; amount: number; paidTo: string | null; reference: string | null; occurredAt: string }
type Voucher = { id: string; packageId: string; packageName: string; username: string; status: string; validitySeconds: number | null; activatedAt: string | null; expiresAt: string | null; createdAt: string }
type VoucherPackage = { id: string; name: string; rateLimit: string; monthlyPrice: number; durationSeconds: number }
type GeneratedVoucher = { id: string; username: string; password: string; packageName: string; validitySeconds: number }
type Equipment = { id: string; name: string; category: string; serialNumber: string | null; manufacturer: string | null; model: string | null; status: string; condition: string; quantity: number; unit: string; minimumQuantity: number; usedQuantity: number; purchasedAt: string | null; notes: string | null; siteId: string | null; siteName: string | null }
type InventoryMovement = { id: string; equipmentId: string; itemName: string; movementType: 'added' | 'used' | 'restocked' | 'adjusted'; quantity: number; notes: string | null; createdAt: string }
type Tr069Device = { id: string; siteId: string | null; siteName: string | null; serialNumber: string; manufacturer: string | null; model: string | null; firmwareVersion: string | null; status: string; lastInformAt: string | null; notes: string | null; createdAt: string }
type Invoice = { id: string; customerId: string; customerName: string; customerEmail: string; customerPhone: string | null; invoiceNumber: string; periodStart: string; periodEnd: string; dueAt: string; amount: number; description: string; status: string; paidAt: string | null; createdAt: string }
type WorkspaceRecord<T> = { items: T[]; movements?: InventoryMovement[]; totals?: { status: string; count: number; amount?: number }[]; total?: { amount: number; count: number }; byCategory?: { category: string; amount: string | number | null; count: number }[]; byTicketCategory?: { category: string; count: number }[]; byPackage?: { packageName: string; count: number }[]; packages?: VoucherPackage[]; plans?: SubscriberPlan[]; sites?: { id: string; name: string; location?: string }[]; activeCustomers?: { id: string; name: string; monthlyRate: number; plan: string | null }[] }

const leadStatuses = ['new', 'contacted', 'qualified', 'converted', 'lost']
const ticketStatuses = ['open', 'in_progress', 'waiting', 'resolved', 'closed']
const ticketPriorities = ['low', 'normal', 'high', 'urgent']
const inventoryPresetNames = [
  'Ubiquiti Litebeam M5',
  'Tenda F6 router',
  'TP-Link EAP 110',
  'Outdoor Cat6 cable',
  'Indoor Cat6 cable',
  'Globe tape',
  'Cable ties',
  'Cable clips',
  'Nails 2 inches',
  'Nails 4 inches',
]

function formatAmount(value: number) {
  return new Intl.NumberFormat().format(value)
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—'
}

function formatVoucherDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? `${new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }).format(date)} EAT`
    : '—'
}

function formatVoucherValidity(seconds: number | null) {
  if (!seconds || seconds <= 0) return 'No expiry configured'
  if (seconds % 86400 === 0) return `${seconds / 86400} ${seconds / 86400 === 1 ? 'day' : 'days'}`
  if (seconds % 3600 === 0) return `${seconds / 3600} ${seconds / 3600 === 1 ? 'hour' : 'hours'}`
  if (seconds % 60 === 0) return `${seconds / 60} minutes`
  return `${seconds} seconds`
}

function getVoucherState(voucher: Voucher, now: number) {
  if (voucher.status === 'disabled') return 'disabled'
  if (voucher.expiresAt && new Date(voucher.expiresAt).getTime() <= now) return 'expired'
  return voucher.activatedAt ? 'in_use' : 'ready'
}

function recordCount(totals: { status: string; count: number }[] | undefined, status: string) {
  return totals?.find((row) => row.status === status)?.count ?? 0
}

function csvField(value: string) {
  const safeValue = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safeValue.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = `\uFEFF${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function OperationsWorkspace({ view }: { view: ModuleView }) {
  const entity = view === 'Leads' ? 'leads' : view.startsWith('Ticket') ? 'tickets' : view === 'Expenses' ? 'expenses' : view === 'Equipment' ? 'equipment' : view === 'TR-069' ? 'tr069' : view === 'Invoices' ? 'invoices' : 'vouchers'
  const [items, setItems] = useState<(Lead | SupportTicket | Expense | Voucher | Equipment | Tr069Device | Invoice)[]>([])
  const [totals, setTotals] = useState<{ status: string; count: number; amount?: number }[]>([])
  const [expenseTotal, setExpenseTotal] = useState({ amount: 0, count: 0 })
  const [expenseCategories, setExpenseCategories] = useState<{ category: string; amount: string | number | null; count: number }[]>([])
  const [voucherPackageCounts, setVoucherPackageCounts] = useState<{ packageName: string; count: number }[]>([])
  const [ticketCategoryCounts, setTicketCategoryCounts] = useState<{ category: string; count: number }[]>([])
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([])
  const [availablePackages, setAvailablePackages] = useState<VoucherPackage[]>([])
  const [siteOptions, setSiteOptions] = useState<{ id: string; name: string; location?: string }[]>([])
  const [subscriberPlans, setSubscriberPlans] = useState<SubscriberPlan[]>([])
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null)
  const [conversionError, setConversionError] = useState('')
  const [createdCustomerId, setCreatedCustomerId] = useState('')
  const [invoiceCustomers, setInvoiceCustomers] = useState<{ id: string; name: string; monthlyRate: number; plan: string | null }[]>([])
  const [generatedVouchers, setGeneratedVouchers] = useState<GeneratedVoucher[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('')
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<string[]>([])
  const [inventoryCheckoutQuantities, setInventoryCheckoutQuantities] = useState<Record<string, string>>({})
  const [inventoryRestockQuantities, setInventoryRestockQuantities] = useState<Record<string, string>>({})
  const [voucherStatusFilter, setVoucherStatusFilter] = useState('all')
  const [voucherNow, setVoucherNow] = useState(() => Date.now())
  const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', location: '', coverageStatus: 'pending', source: '', notes: '' })
  const [conversionForm, setConversionForm] = useState({ email: '', phone: '', location: '', siteId: '', packageId: '', radiusUsername: '', password: '' })
  const [ticketForm, setTicketForm] = useState({ requesterName: '', requesterEmail: '', subject: '', description: '', category: 'no_internet', priority: 'normal' })
  const [expenseForm, setExpenseForm] = useState({ category: '', description: '', amount: '', paidTo: '', reference: '', occurredAt: new Date().toISOString().slice(0, 10) })
  const [voucherForm, setVoucherForm] = useState({ packageId: '', quantity: '10', sendSms: false, phone: '' })
  const [equipmentForm, setEquipmentForm] = useState({ name: '', category: '', serialNumber: '', manufacturer: '', model: '', siteId: '', status: 'spare', condition: 'good', quantity: '0', unit: 'pcs', minimumQuantity: '0', purchasedAt: '', notes: '' })
  const [tr069Form, setTr069Form] = useState({ serialNumber: '', manufacturer: '', model: '', firmwareVersion: '', siteId: '', notes: '' })
  const [invoiceForm, setInvoiceForm] = useState({ period: new Date().toISOString().slice(0, 7), dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/operations/${entity}`, { cache: 'no-store' })
      const result = await response.json() as WorkspaceRecord<Lead | SupportTicket | Expense | Voucher | Equipment | Tr069Device | Invoice> & { error?: string }
      if (!response.ok) throw new Error(result.error || `Unable to load ${entity}.`)
      setItems(result.items)
      setInventoryMovements(result.movements || [])
      setTotals(result.totals || [])
      setExpenseTotal(result.total || { amount: 0, count: 0 })
      setExpenseCategories(result.byCategory || [])
      setVoucherPackageCounts(result.byPackage || [])
      setTicketCategoryCounts(result.byTicketCategory || [])
      setAvailablePackages(result.packages || [])
      setSubscriberPlans(result.plans || [])
      setSiteOptions(result.sites || [])
      setInvoiceCustomers(result.activeCustomers || [])
      if (entity === 'vouchers' && result.packages?.length && !voucherForm.packageId) {
        setVoucherForm((current) => ({ ...current, packageId: result.packages![0].id }))
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load workspace records.')
    } finally {
      setLoading(false)
    }
  }, [entity, voucherForm.packageId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (entity !== 'vouchers') return
    const timer = window.setInterval(() => setVoucherNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [entity])

  const filteredItems = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return items
    return items.filter((item) => JSON.stringify(item).toLowerCase().includes(term))
  }, [filter, items])
  const filteredVouchers = useMemo(() => (filteredItems as Voucher[])
    .filter((voucher) => voucherStatusFilter === 'all' || getVoucherState(voucher, voucherNow) === voucherStatusFilter),
  [filteredItems, voucherStatusFilter, voucherNow])
  const voucherCounts = useMemo(() => {
    const counts = { ready: 0, in_use: 0, expired: 0, disabled: 0 }
    for (const voucher of items as Voucher[]) counts[getVoucherState(voucher, voucherNow)] += 1
    return counts
  }, [items, voucherNow])

  async function createRecord(body: Record<string, unknown>) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/operations/${entity}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json() as { error?: string; vouchers?: GeneratedVoucher[]; smsQueued?: boolean; created?: number; skipped?: number; eligible?: number; period?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save this record.')
      if (entity === 'vouchers') {
        setGeneratedVouchers(result.vouchers || [])
        const smsNotice = voucherForm.sendSms
          ? result.smsQueued ? ' Voucher SMS queued for delivery.' : ' The SMS could not be queued; check your message template and SMS setup.'
          : ''
        setNotice(`${result.vouchers?.length || 0} voucher credentials created.${smsNotice} Their plan validity starts on first connection; save or download the one-time passwords now.`)
        setVoucherForm((current) => ({ ...current, quantity: '10' }))
      } else if (entity === 'invoices') {
        setNotice(`Billing period ${result.period}: ${result.created} invoices issued; ${result.skipped} already existed or were not eligible out of ${result.eligible} active subscribers.`)
      } else if (entity === 'equipment') {
        setNotice('Equipment record saved.')
        setEquipmentForm({ name: '', category: '', serialNumber: '', manufacturer: '', model: '', siteId: '', status: 'spare', condition: 'good', quantity: '0', unit: 'pcs', minimumQuantity: '0', purchasedAt: '', notes: '' })
      } else if (entity === 'tr069') {
        setNotice('Device added to the TR-069 registry. It will remain pending until an ACS reports it.')
        setTr069Form({ serialNumber: '', manufacturer: '', model: '', firmwareVersion: '', siteId: '', notes: '' })
      } else {
        setNotice('Record saved.')
        if (entity === 'leads') setLeadForm({ name: '', email: '', phone: '', location: '', coverageStatus: 'pending', source: '', notes: '' })
        if (entity === 'tickets') setTicketForm({ requesterName: '', requesterEmail: '', subject: '', description: '', category: 'no_internet', priority: 'normal' })
        if (entity === 'expenses') setExpenseForm({ category: '', description: '', amount: '', paidTo: '', reference: '', occurredAt: new Date().toISOString().slice(0, 10) })
      }

      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save this record.')
    } finally {
      setSaving(false)
    }
  }

  function beginLeadConversion(lead: Lead) {
    setConversionError('')
    setCreatedCustomerId('')
    setConvertingLead(lead)
    setConversionForm({
      email: lead.email || '',
      phone: lead.phone || '',
      location: lead.location || '',
      siteId: '',
      packageId: subscriberPlans[0]?.id || '',
      radiusUsername: '',
      password: '',
    })
  }

  async function convertLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!convertingLead) return
    setSaving(true)
    setConversionError('')
    try {
      let customerId = createdCustomerId
      if (!customerId) {
        const response = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: convertingLead.name,
            email: conversionForm.email,
            phone: conversionForm.phone,
            location: conversionForm.location,
            siteId: conversionForm.siteId || null,
            packageId: conversionForm.packageId,
            radiusUsername: conversionForm.radiusUsername,
            password: conversionForm.password,
          }),
        })
        const result = await response.json() as { id?: string; error?: string }
        if (!response.ok || !result.id) throw new Error(result.error || 'Unable to create the subscriber account.')
        customerId = result.id
        setCreatedCustomerId(customerId)
      }

      const linkResponse = await fetch(`/api/operations/leads?id=${encodeURIComponent(convertingLead.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'converted', customerId }),
      })
      const linkResult = await linkResponse.json() as { error?: string }
      if (!linkResponse.ok) throw new Error(`Subscriber account created, but the lead could not be linked: ${linkResult.error || 'Please retry linking.'}`)
      setNotice('Lead converted to a suspended subscriber account. Activate it after confirming the service details.')
      setConvertingLead(null)
      setCreatedCustomerId('')
      await load()
    } catch (reason) {
      setConversionError(reason instanceof Error ? reason.message : 'Unable to convert this lead.')
    } finally {
      setSaving(false)
    }
  }

  async function updateRecord(id: string, changes: Record<string, unknown>) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/operations/${entity}?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(changes),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to update this record.')
      setNotice('Record updated.')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update this record.')
    } finally {
      setSaving(false)
    }
  }

  async function checkoutInventory() {
    if (selectedInventoryIds.length === 0) return
    const checkouts = selectedInventoryIds.map((id) => {
      const quantity = Number(inventoryCheckoutQuantities[id] ?? '1')
      return { id, quantity }
    })
    if (checkouts.some(({ quantity }) => !Number.isInteger(quantity) || quantity <= 0)) {
      setError('Enter a whole quantity greater than zero for every selected item.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/operations/equipment?id=batch`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkouts }),
      })
      const result = await response.json() as { error?: string; checkedOut?: number }
      if (!response.ok) throw new Error(result.error || 'Unable to check out inventory items.')
      setNotice(`${result.checkedOut ?? checkouts.length} inventory item${checkouts.length === 1 ? '' : 's'} checked out and stock reduced.`)
      setSelectedInventoryIds([])
      setInventoryCheckoutQuantities({})
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to check out inventory items.')
    } finally {
      setSaving(false)
    }
  }

  async function restockInventory(id: string, itemName: string) {
    const quantity = Number(inventoryRestockQuantities[id] ?? '1')
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError(`Enter a valid restock quantity for ${itemName}.`)
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/operations/equipment?id=batch', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ restock: { id, quantity } }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to restock this item.')
      setNotice(`${quantity} ${itemName} added to stock.`)
      setInventoryRestockQuantities((current) => ({ ...current, [id]: '1' }))
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to restock this item.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecord(id: string, confirmation = 'Delete this record? This cannot be undone.') {
    if (!window.confirm(confirmation)) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/operations/${entity}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to delete this record.')
      setNotice(entity === 'vouchers' ? 'Voucher deleted and its RADIUS login revoked.' : entity === 'invoices' ? 'Invoice deleted.' : 'Record deleted.')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete this record.')
    } finally {
      setSaving(false)
    }
  }

  function downloadGeneratedVouchers() {
    downloadCsv(`lktech-vouchers-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Username', 'Password', 'Plan', 'Valid for', 'Expiry'],
      ...generatedVouchers.map((voucher) => [voucher.username, voucher.password, voucher.packageName, formatVoucherValidity(voucher.validitySeconds), 'Starts on first connection']),
    ])
  }

  function downloadVoucherRegister() {
    downloadCsv(`lktech-issued-vouchers-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Username', 'Plan', 'Status', 'Created', 'First connection', 'Expires', 'Validity'],
      ...filteredVouchers.map((voucher) => [
        voucher.username,
        voucher.packageName,
        getVoucherState(voucher, voucherNow).replace('_', ' '),
        voucher.createdAt,
        voucher.activatedAt || '',
        voucher.expiresAt || '',
        formatVoucherValidity(voucher.validitySeconds),
      ]),
    ])
  }

  function downloadInvoices() {
    const invoiceItems = filteredItems as Invoice[]
    if (invoiceItems.length === 0) {
      setNotice('There are no invoices to export for this filter.')
      return
    }
    downloadCsv(`lktech-invoices-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Invoice', 'Subscriber', 'Email', 'Description', 'Period start', 'Period end', 'Due date', 'Amount', 'Status'],
      ...invoiceItems.map((invoice) => [invoice.invoiceNumber, invoice.customerName, invoice.customerEmail, invoice.description, invoice.periodStart, invoice.periodEnd, invoice.dueAt, String(invoice.amount), invoice.status]),
    ])
  }

  const title = view === 'Leads' ? 'Leads' : view.startsWith('Ticket') ? view : view === 'Expenses' ? 'Expenses' : view === 'Generate vouchers' ? 'Generate vouchers' : view === 'Voucher analytics' ? 'Voucher analytics' : view === 'Equipment' ? 'Inventory tracker' : view === 'TR-069' ? 'TR-069 device registry' : view === 'Invoices' ? 'Invoices' : 'Voucher list'
  const description = view === 'Leads'
    ? 'Capture prospects and track each opportunity through your sales pipeline.'
    : view.startsWith('Ticket')
      ? 'Record customer issues, assign ownership, and track resolution.'
      : view === 'Expenses'
        ? 'Record and review operating costs for this workspace.'
        : view === 'Equipment'
          ? 'Track stock quantities, low-stock limits, condition, usage status, and assigned network sites.'
          : view === 'TR-069'
            ? 'Maintain a device registry. Live remote management requires an ACS/CWMP server.'
            : view === 'Invoices'
              ? 'Issue monthly invoices from active subscribers’ recorded monthly plans, track status, and export.'
              : 'Create RADIUS-backed hotspot credentials and track issued voucher codes.'

  return (
    <section className={`operations-workspace${entity === 'vouchers' ? ' voucher-workspace' : ''}`}>
      <div className="page-heading operations-page-heading">
        <div><div className="live-label"><Ticket size={13} /> WORKSPACE OPERATIONS</div><h1>{title}</h1><p>{description}</p></div>
        <button type="button" className="outline-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> Refresh</button>
      </div>
      {error && <p className="operations-message is-error" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={14} /></button></p>}
      {notice && <p className="operations-message" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={14} /></button></p>}

      {view === 'Ticket analytics' ? <div className="operations-analytics">
        <div className="operations-stat-grid">
          {['open', 'in_progress', 'waiting', 'resolved', 'closed'].map((status) => <article className="metric-card" key={status}><span className="eyebrow">{status.replace('_', ' ')}</span><strong className="metric-value">{loading ? '—' : formatAmount(recordCount(totals, status))}</strong><span className="operations-stat-caption">tickets</span></article>)}
        </div>
        <section className="panel operations-panel"><div className="panel-heading"><div><h3>Ticket status breakdown</h3><span>Counts across recorded workspace tickets</span></div></div>{totals.length ? <div className="operations-breakdown">{ticketStatuses.map((status) => <div key={status}><span>{status.replace('_', ' ')}</span><strong>{formatAmount(recordCount(totals, status))}</strong></div>)}</div> : <p className="header-empty">{loading ? 'Loading ticket analytics…' : 'No ticket records to analyze yet.'}</p>}</section>
        <section className="panel operations-panel"><div className="panel-heading"><div><h3>Tickets by category</h3><span>Customer issues reported to support</span></div></div>{ticketCategoryCounts.length ? <div className="operations-breakdown">{SUPPORT_TICKET_CATEGORIES.map((category) => <div key={category}><span>{supportTicketCategoryLabel(category)}</span><strong>{formatAmount(ticketCategoryCounts.find((row) => row.category === category)?.count ?? 0)}</strong></div>)}</div> : <p className="header-empty">{loading ? 'Loading ticket categories…' : 'No ticket categories to analyze yet.'}</p>}</section>
      </div> : view === 'Voucher analytics' ? <div className="operations-analytics">
        <div className="operations-stat-grid"><article className="metric-card"><span className="eyebrow">Total vouchers</span><strong className="metric-value">{loading ? '—' : formatAmount(totals.reduce((total, item) => total + item.count, 0))}</strong><span className="operations-stat-caption">issued credentials</span></article>{['active', 'disabled'].map((status) => <article className="metric-card" key={status}><span className="eyebrow">{status}</span><strong className="metric-value">{loading ? '—' : formatAmount(recordCount(totals, status))}</strong><span className="operations-stat-caption">vouchers</span></article>)}</div>
        <section className="panel operations-panel"><div className="panel-heading"><div><h3>Voucher packages</h3><span>Generated vouchers by configured plan</span></div></div>{voucherPackageCounts.length ? <div className="operations-breakdown">{voucherPackageCounts.map(({ packageName, count }) => <div key={packageName}><span>{packageName}</span><strong>{formatAmount(count)}</strong></div>)}</div> : <p className="header-empty">{loading ? 'Loading voucher analytics…' : 'No vouchers have been generated yet.'}</p>}</section>
      </div> : view === 'Expenses' ? <>
        <div className="operations-stat-grid"><article className="metric-card"><span className="eyebrow">Recorded expenses</span><strong className="metric-value">{loading ? '—' : formatAmount(expenseTotal.count)}</strong></article><article className="metric-card"><span className="eyebrow">Total amount</span><strong className="metric-value">{loading ? '—' : formatAmount(expenseTotal.amount)}</strong><span className="operations-stat-caption">in recorded currency units</span></article></div>
        <form className="operations-form panel" onSubmit={(event) => { event.preventDefault(); void createRecord({ ...expenseForm, amount: Number(expenseForm.amount), occurredAt: new Date(`${expenseForm.occurredAt}T12:00:00`).toISOString() }) }}>
          <h2>Record an expense</h2><div className="operations-form-grid"><label>Category<input required maxLength={80} value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })} placeholder="Internet, equipment, travel…" /></label><label>Description<input required maxLength={240} value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} /></label><label>Amount<input required type="number" min="1" step="1" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} /></label><label>Expense date<input required type="date" value={expenseForm.occurredAt} onChange={(event) => setExpenseForm({ ...expenseForm, occurredAt: event.target.value })} /></label><label>Paid to<input maxLength={120} value={expenseForm.paidTo} onChange={(event) => setExpenseForm({ ...expenseForm, paidTo: event.target.value })} /></label><label>Reference<input maxLength={120} value={expenseForm.reference} onChange={(event) => setExpenseForm({ ...expenseForm, reference: event.target.value })} /></label></div><button type="submit" className="primary-button" disabled={saving}><Plus size={14} /> {saving ? 'Saving…' : 'Add expense'}</button>
        </form>
        <section className="panel operations-panel"><div className="panel-heading"><div><h3>Expense records</h3><span>{expenseTotal.count} total records</span></div><input className="record-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter expenses…" aria-label="Filter expenses" /></div>{expenseCategories.length > 0 && <div className="operations-breakdown">{expenseCategories.map((category) => <div key={category.category}><span>{category.category}</span><strong>{formatAmount(Number(category.amount || 0))}</strong></div>)}</div>}<div className="table-scroll"><table><thead><tr><th>Date</th><th>Category / Description</th><th>Paid to</th><th>Reference</th><th>Amount</th><th /></tr></thead><tbody>{(filteredItems as Expense[]).map((expense) => <tr key={expense.id}><td>{formatDate(expense.occurredAt)}</td><td><strong>{expense.category}</strong><span>{expense.description}</span></td><td>{expense.paidTo || '—'}</td><td>{expense.reference || '—'}</td><td>{formatAmount(expense.amount)}</td><td><button className="text-button danger-text" disabled={saving} aria-label={`Delete ${expense.description}`} onClick={() => void deleteRecord(expense.id)}><Trash2 size={14} /></button></td></tr>)}{!loading && filteredItems.length === 0 && <tr><td colSpan={6}>No expense records found.</td></tr>}</tbody></table></div></section>
      </> : view === 'Leads' ? <>
        <div className="operations-stat-grid">{leadStatuses.map((status) => <article className="metric-card" key={status}><span className="eyebrow">{status}</span><strong className="metric-value">{loading ? '—' : formatAmount(recordCount(totals, status))}</strong><span className="operations-stat-caption">leads</span></article>)}<article className="metric-card"><span className="eyebrow">Not covered</span><strong className="metric-value">{loading ? '—' : formatAmount((items as Lead[]).filter((lead) => lead.coverageStatus === 'unavailable').length)}</strong><span className="operations-stat-caption">leads outside coverage</span></article></div>
        <form className="operations-form panel" onSubmit={(event) => { event.preventDefault(); void createRecord(leadForm) }}><h2>Add a lead</h2><div className="operations-form-grid"><label>Name<input required maxLength={120} value={leadForm.name} onChange={(event) => setLeadForm({ ...leadForm, name: event.target.value })} /></label><label>Email<input type="email" maxLength={254} value={leadForm.email} onChange={(event) => setLeadForm({ ...leadForm, email: event.target.value })} /></label><label>Phone<input type="tel" inputMode="tel" pattern={KENYAN_MOBILE_PHONE_PATTERN} title="Enter 07 followed by 8 digits or +254 followed by 9 digits." maxLength={13} placeholder="0712345678 or +254712345678" value={leadForm.phone} onChange={(event) => setLeadForm({ ...leadForm, phone: event.target.value })} /></label><label>Location<input maxLength={240} value={leadForm.location} onChange={(event) => setLeadForm({ ...leadForm, location: event.target.value })} placeholder="Customer area or address" /></label><label>Coverage<select value={leadForm.coverageStatus} onChange={(event) => setLeadForm({ ...leadForm, coverageStatus: event.target.value })}><option value="pending">Check coverage</option><option value="covered">Covered</option><option value="unavailable">Not covered</option></select></label><label>Source<input maxLength={80} value={leadForm.source} onChange={(event) => setLeadForm({ ...leadForm, source: event.target.value })} placeholder="Referral, website…" /></label><label className="operations-wide">Notes<textarea maxLength={2000} rows={2} value={leadForm.notes} onChange={(event) => setLeadForm({ ...leadForm, notes: event.target.value })} /></label></div><button type="submit" className="primary-button" disabled={saving}><Plus size={14} /> {saving ? 'Saving…' : 'Add lead'}</button></form>
        <RecordTable title="Lead pipeline" items={filteredItems.length} loading={loading} filter={filter} setFilter={setFilter} filterLabel="Filter leads" emptyText="No leads found." headers={['Lead', 'Contact', 'Location', 'Coverage', 'Status', 'Source', 'Created', 'Actions']}><tbody>{(filteredItems as Lead[]).map((lead) => <tr key={lead.id}><td><strong>{lead.name}</strong>{lead.notes && <span>{lead.notes}</span>}</td><td>{lead.email || lead.phone || '—'}{lead.email && lead.phone && <span>{lead.phone}</span>}</td><td>{lead.location || '—'}</td><td><select aria-label={`Coverage for ${lead.name}`} value={lead.coverageStatus} disabled={saving || Boolean(lead.customerId)} onChange={(event) => void updateRecord(lead.id, { coverageStatus: event.target.value })}><option value="pending">Check coverage</option><option value="covered">Covered</option><option value="unavailable">Not covered</option></select></td><td><select aria-label={`Status for ${lead.name}`} value={lead.status} disabled={saving || lead.status === 'converted'} onChange={(event) => void updateRecord(lead.id, { status: event.target.value })}>{leadStatuses.map((status) => <option key={status} value={status} disabled={status === 'converted' && !lead.customerId}>{status}</option>)}</select></td><td>{lead.source || '—'}</td><td>{formatDate(lead.createdAt)}</td><td>{lead.customerId ? <span>Customer created</span> : <button type="button" className="text-button" disabled={saving || lead.coverageStatus !== 'covered'} title={lead.coverageStatus !== 'covered' ? 'Mark coverage as covered before converting.' : undefined} onClick={() => beginLeadConversion(lead)}>Convert to customer</button>}<button type="button" className="text-button danger-text" disabled={saving} aria-label={`Delete lead ${lead.name}`} onClick={() => void deleteRecord(lead.id)}><Trash2 size={14} /></button></td></tr>)}</tbody></RecordTable>
        {convertingLead && <form className="operations-form panel" onSubmit={(event) => void convertLead(event)}><h2>Convert {convertingLead.name} to a subscriber</h2><p>The new account starts suspended. Choose a service plan and create RADIUS credentials.</p><div className="operations-form-grid"><label>Email<input required type="email" maxLength={254} value={conversionForm.email} disabled={Boolean(createdCustomerId)} onChange={(event) => setConversionForm({ ...conversionForm, email: event.target.value })} /></label><label>Phone<input type="tel" inputMode="tel" pattern={KENYAN_MOBILE_PHONE_PATTERN} title="Enter 07 followed by 8 digits or +254 followed by 9 digits." maxLength={13} value={conversionForm.phone} disabled={Boolean(createdCustomerId)} onChange={(event) => setConversionForm({ ...conversionForm, phone: event.target.value })} /></label><label>Location<input maxLength={240} value={conversionForm.location} disabled={Boolean(createdCustomerId)} onChange={(event) => setConversionForm({ ...conversionForm, location: event.target.value })} /></label><label>Network site<select value={conversionForm.siteId} disabled={Boolean(createdCustomerId)} onChange={(event) => setConversionForm({ ...conversionForm, siteId: event.target.value })}><option value="">No site assigned</option>{siteOptions.map((site) => <option key={site.id} value={site.id}>{site.name}{site.location ? ` · ${site.location}` : ''}</option>)}</select></label><label>Service package<select required value={conversionForm.packageId} disabled={Boolean(createdCustomerId)} onChange={(event) => setConversionForm({ ...conversionForm, packageId: event.target.value })}><option value="">Select a package</option>{subscriberPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.type} · {plan.rateLimit} · KSh {plan.monthlyPrice.toLocaleString('en-KE')}</option>)}</select></label><label>RADIUS username<input required minLength={3} maxLength={64} pattern="[A-Za-z0-9._@-]{3,64}" value={conversionForm.radiusUsername} disabled={Boolean(createdCustomerId)} onChange={(event) => setConversionForm({ ...conversionForm, radiusUsername: event.target.value })} /></label><label>Password<input required type="password" minLength={12} maxLength={128} value={conversionForm.password} disabled={Boolean(createdCustomerId)} onChange={(event) => setConversionForm({ ...conversionForm, password: event.target.value })} /></label></div>{conversionError && <p className="operations-message is-error" role="alert">{conversionError}</p>}<button type="submit" className="primary-button" disabled={saving || (!createdCustomerId && (!subscriberPlans.length || !conversionForm.packageId))}>{saving ? 'Converting…' : createdCustomerId ? 'Retry linking lead' : 'Create subscriber account'}</button><button type="button" className="outline-button" disabled={saving} onClick={() => { setConvertingLead(null); setCreatedCustomerId(''); setConversionError('') }}>Cancel</button></form>}
      </> : entity === 'tickets' ? <>
        {view === 'Ticket list' && <form className="operations-form panel" onSubmit={(event) => { event.preventDefault(); void createRecord(ticketForm) }}><h2>Create support ticket</h2><div className="operations-form-grid"><label>Requester<input required maxLength={120} value={ticketForm.requesterName} onChange={(event) => setTicketForm({ ...ticketForm, requesterName: event.target.value })} /></label><label>Requester email<input type="email" maxLength={254} value={ticketForm.requesterEmail} onChange={(event) => setTicketForm({ ...ticketForm, requesterEmail: event.target.value })} /></label><label>Subject<input required maxLength={180} value={ticketForm.subject} onChange={(event) => setTicketForm({ ...ticketForm, subject: event.target.value })} /></label><label>Category<select value={ticketForm.category} onChange={(event) => setTicketForm({ ...ticketForm, category: event.target.value })}>{SUPPORT_TICKET_CATEGORIES.map((category) => <option key={category} value={category}>{supportTicketCategoryLabel(category)}</option>)}</select></label><label>Priority<select value={ticketForm.priority} onChange={(event) => setTicketForm({ ...ticketForm, priority: event.target.value })}>{ticketPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label><label className="operations-wide">Description<textarea required maxLength={5000} rows={3} value={ticketForm.description} onChange={(event) => setTicketForm({ ...ticketForm, description: event.target.value })} /></label></div><button type="submit" className="primary-button" disabled={saving}><Plus size={14} /> {saving ? 'Creating…' : 'Create ticket'}</button></form>}
        <RecordTable title="Support tickets" items={filteredItems.length} loading={loading} filter={filter} setFilter={setFilter} filterLabel="Filter tickets" emptyText="No tickets found." headers={['Ticket', 'Requester', 'Category', 'Priority', 'Status', 'Assigned to', 'Updated', '']}><tbody>{(filteredItems as SupportTicket[]).map((ticket) => <tr key={ticket.id}><td><strong>{ticket.subject}</strong><span>{ticket.description}</span></td><td>{ticket.requesterName}{ticket.requesterEmail && <span>{ticket.requesterEmail}</span>}</td><td><select aria-label={`Category for ${ticket.subject}`} value={ticket.category} disabled={saving} onChange={(event) => void updateRecord(ticket.id, { category: event.target.value })}>{SUPPORT_TICKET_CATEGORIES.map((category) => <option key={category} value={category}>{supportTicketCategoryLabel(category)}</option>)}</select></td><td><select aria-label={`Priority for ${ticket.subject}`} value={ticket.priority} disabled={saving} onChange={(event) => void updateRecord(ticket.id, { priority: event.target.value })}>{ticketPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select></td><td><select aria-label={`Status for ${ticket.subject}`} value={ticket.status} disabled={saving} onChange={(event) => void updateRecord(ticket.id, { status: event.target.value })}>{ticketStatuses.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></td><td><input aria-label={`Assignee for ${ticket.subject}`} defaultValue={ticket.assignedTo || ''} placeholder="Assign technician" disabled={saving} onBlur={(event) => { const assignedTo = event.currentTarget.value.trim(); if (assignedTo !== (ticket.assignedTo || '')) void updateRecord(ticket.id, { assignedTo }) }} /></td><td>{formatDate(ticket.updatedAt)}</td><td><button type="button" className="text-button danger-text" disabled={saving} aria-label={`Delete ticket ${ticket.subject}`} onClick={() => void deleteRecord(ticket.id)}><Trash2 size={14} /></button></td></tr>)}</tbody></RecordTable>
      </> : view === 'Equipment' ? <>
        <div className="operations-stat-grid">
          <article className="metric-card"><span className="eyebrow">Inventory items</span><strong className="metric-value">{loading ? '—' : formatAmount(items.length)}</strong><span className="operations-stat-caption">different products</span></article>
          <article className="metric-card"><span className="eyebrow">Items remaining</span><strong className="metric-value">{loading ? '—' : formatAmount((items as Equipment[]).reduce((total, item) => total + item.quantity, 0))}</strong><span className="operations-stat-caption">units currently in stock</span></article>
          <article className="metric-card"><span className="eyebrow">Items used</span><strong className="metric-value">{loading ? '—' : formatAmount((items as Equipment[]).reduce((total, item) => total + item.usedQuantity, 0))}</strong><span className="operations-stat-caption">units checked out</span></article>
          <article className="metric-card"><span className="eyebrow">Low stock</span><strong className="metric-value">{loading ? '—' : formatAmount((items as Equipment[]).filter((record) => record.quantity <= record.minimumQuantity).length)}</strong><span className="operations-stat-caption">items at or below limit</span></article>
        </div>
        <form className="operations-form panel" onSubmit={(event) => {
          event.preventDefault()
          void createRecord({
            ...equipmentForm,
            quantity: Number(equipmentForm.quantity),
            minimumQuantity: Number(equipmentForm.minimumQuantity),
            purchasedAt: equipmentForm.purchasedAt || null,
            siteId: equipmentForm.siteId || null,
          })
        }}>
          <h2>Add inventory item</h2><div className="operations-form-grid">
            <label>Item name<input required list="inventory-item-presets" maxLength={120} value={equipmentForm.name} onChange={(event) => setEquipmentForm({ ...equipmentForm, name: event.target.value })} placeholder="Select a preset or enter a custom item" /><datalist id="inventory-item-presets">{inventoryPresetNames.map((name) => <option key={name} value={name} />)}</datalist></label>
            <label>Category<input required maxLength={80} value={equipmentForm.category} onChange={(event) => setEquipmentForm({ ...equipmentForm, category: event.target.value })} placeholder="Hardware, cable, consumable…" /></label>
            <label>Manufacturer<input maxLength={120} value={equipmentForm.manufacturer} onChange={(event) => setEquipmentForm({ ...equipmentForm, manufacturer: event.target.value })} /></label>
            <label>Model<input maxLength={120} value={equipmentForm.model} onChange={(event) => setEquipmentForm({ ...equipmentForm, model: event.target.value })} /></label>
            <label>Quantity<input required type="number" min="0" step="1" value={equipmentForm.quantity} onChange={(event) => setEquipmentForm({ ...equipmentForm, quantity: event.target.value })} /></label>
            <label>Unit<select value={equipmentForm.unit} onChange={(event) => setEquipmentForm({ ...equipmentForm, unit: event.target.value })}><option value="pcs">Pieces</option><option value="roll">Rolls</option><option value="meter">Meters</option><option value="pack">Packs</option><option value="box">Boxes</option><option value="kg">Kilograms</option></select></label>
            <label>Site<select value={equipmentForm.siteId} onChange={(event) => setEquipmentForm({ ...equipmentForm, siteId: event.target.value })}><option value="">Unassigned</option>{siteOptions.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
            <label>Status<select value={equipmentForm.status} onChange={(event) => setEquipmentForm({ ...equipmentForm, status: event.target.value })}><option value="new">New</option><option value="unused">Unused</option><option value="in_service">In service</option><option value="spare">Spare</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></select></label>
            <label>Condition<select value={equipmentForm.condition} onChange={(event) => setEquipmentForm({ ...equipmentForm, condition: event.target.value })}><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></label>
            <label>Purchase date<input type="date" value={equipmentForm.purchasedAt} onChange={(event) => setEquipmentForm({ ...equipmentForm, purchasedAt: event.target.value })} /></label>
            <label className="operations-wide">Notes<textarea maxLength={2000} rows={2} value={equipmentForm.notes} onChange={(event) => setEquipmentForm({ ...equipmentForm, notes: event.target.value })} /></label>
          </div><button type="submit" className="primary-button" disabled={saving}><Plus size={14} /> {saving ? 'Saving…' : 'Add inventory item'}</button>
        </form>
        <section className="panel inventory-store-panel">
          <div className="panel-heading"><div><h3>Stock store</h3><span>Remaining and used quantities for every item</span></div></div>
          {loading ? <p className="header-empty">Loading inventory…</p> : (items as Equipment[]).length === 0 ? <p className="header-empty">No inventory items yet.</p> : (
            <div className="inventory-store-grid">
              {(items as Equipment[]).map((record) => {
                const selected = selectedInventoryIds.includes(record.id)
                const lowStock = record.quantity <= record.minimumQuantity
                return <article className={`inventory-store-card${lowStock ? ' is-low-stock' : ''}`} key={record.id}>
                  <div className="inventory-store-card-head">
                    <label className="inventory-select"><input type="checkbox" checked={selected} disabled={saving || record.quantity === 0} onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedInventoryIds((current) => [...current, record.id])
                        setInventoryCheckoutQuantities((current) => ({ ...current, [record.id]: current[record.id] || '1' }))
                      } else {
                        setSelectedInventoryIds((current) => current.filter((id) => id !== record.id))
                      }
                    }} /><span>{record.category}</span></label>
                    {lowStock && <span className="inventory-low-badge">Low stock</span>}
                  </div>
                  <div className="inventory-store-title"><strong>{record.name}</strong>{record.model && <span>{record.model}</span>}</div>
                  <div className="inventory-stock-counts">
                    <div><span>Remaining</span><strong>{formatAmount(record.quantity)}</strong><small>{record.unit}</small></div>
                    <div><span>Used</span><strong>{formatAmount(record.usedQuantity)}</strong><small>{record.unit}</small></div>
                  </div>
                  <div className="inventory-store-actions">
                    <label><span>Used</span><input type="number" min="1" max={record.quantity} step="1" value={inventoryCheckoutQuantities[record.id] ?? '1'} disabled={saving || !selected || record.quantity === 0} onChange={(event) => setInventoryCheckoutQuantities((current) => ({ ...current, [record.id]: event.target.value }))} /></label>
                    <label><span>Restock</span><input type="number" min="1" step="1" value={inventoryRestockQuantities[record.id] ?? '1'} disabled={saving} onChange={(event) => setInventoryRestockQuantities((current) => ({ ...current, [record.id]: event.target.value }))} /></label>
                    <button type="button" className="outline-button" disabled={saving} onClick={() => void restockInventory(record.id, record.name)}><Plus size={13} /> Restock</button>
                  </div>
                </article>
              })}
            </div>
          )}
        </section>
        <form className="operations-form panel" onSubmit={(event) => { event.preventDefault(); void checkoutInventory() }}>
          <h2>Check out used items</h2>
          <p>Select items in the table below, enter each quantity used, then check them out. Stock is reduced immediately.</p>
          <button type="submit" className="primary-button" disabled={saving || selectedInventoryIds.length === 0}><Minus size={14} /> {saving ? 'Checking out…' : `Check out ${selectedInventoryIds.length || ''} selected item${selectedInventoryIds.length === 1 ? '' : 's'}`}</button>
        </form>
        <RecordTable title="Inventory tracker" items={filteredItems.length} loading={loading} filter={filter} setFilter={setFilter} filterLabel="Filter inventory" emptyText="No inventory items yet." headers={['Select', 'Item', 'Category', 'Stock', 'Used quantity', 'Site', 'Condition', 'Status', 'Model', '']}><tbody>{(filteredItems as Equipment[]).map((record) => {
          const lowStock = record.quantity <= record.minimumQuantity
          const selected = selectedInventoryIds.includes(record.id)
          return <tr key={record.id}>
            <td><input type="checkbox" checked={selected} aria-label={`Select ${record.name}`} disabled={saving || record.quantity === 0} onChange={(event) => {
              if (event.target.checked) {
                setSelectedInventoryIds((current) => [...current, record.id])
                setInventoryCheckoutQuantities((current) => ({ ...current, [record.id]: current[record.id] || '1' }))
              } else {
                setSelectedInventoryIds((current) => current.filter((id) => id !== record.id))
              }
            }} /></td>
            <td><strong>{record.name}</strong>{record.manufacturer && <span>{record.manufacturer}</span>}</td>
            <td>{record.category}</td>
            <td><input className={lowStock ? 'inventory-low-stock-input' : ''} aria-label={`Quantity of ${record.name}`} type="number" min="0" step="1" defaultValue={record.quantity} disabled={saving} onBlur={(event) => { const quantity = Number(event.currentTarget.value); if (Number.isInteger(quantity) && quantity >= 0 && quantity !== record.quantity) void updateRecord(record.id, { quantity }) }} /><span>{record.unit}</span></td>
            <td><input className="inventory-used-input" aria-label={`Used quantity of ${record.name}`} type="number" min="1" max={record.quantity} step="1" value={inventoryCheckoutQuantities[record.id] ?? '1'} disabled={saving || !selected} onChange={(event) => setInventoryCheckoutQuantities((current) => ({ ...current, [record.id]: event.target.value }))} /></td>
            <td>{record.siteName || 'Unassigned'}</td>
            <td><select aria-label={`Condition of ${record.name}`} value={record.condition} disabled={saving} onChange={(event) => void updateRecord(record.id, { condition: event.target.value })}><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></td>
            <td><select aria-label={`Status of ${record.name}`} value={record.status} disabled={saving} onChange={(event) => void updateRecord(record.id, { status: event.target.value })}><option value="new">New</option><option value="unused">Unused</option><option value="in_service">In service</option><option value="spare">Spare</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></select></td>
            <td>{record.model || '—'}</td>
            <td><button type="button" className="text-button danger-text" disabled={saving} aria-label={`Delete ${record.name}`} onClick={() => void deleteRecord(record.id, 'Delete this inventory item? This cannot be undone.')}><Trash2 size={14} /></button></td>
          </tr>
        })}</tbody></RecordTable>
        <section className="panel inventory-history-panel">
          <div className="panel-heading"><div><h3>Stock movement history</h3><span>Recent additions, restocks, and item usage</span></div></div>
          {inventoryMovements.length === 0 ? <p className="header-empty">No stock movements recorded yet.</p> : (
            <div className="table-scroll"><table><thead><tr><th>Item</th><th>Movement</th><th>Quantity</th><th>Date</th></tr></thead><tbody>
              {inventoryMovements.map((movement) => <tr key={movement.id}>
                <td><strong>{movement.itemName}</strong>{movement.notes && <span>{movement.notes}</span>}</td>
                <td><span className={`inventory-movement movement-${movement.movementType}`}>{movement.movementType}</span></td>
                <td><strong>{movement.movementType === 'used' ? '-' : '+'}{formatAmount(movement.quantity)}</strong></td>
                <td>{formatDate(movement.createdAt)}</td>
              </tr>)}
            </tbody></table></div>
          )}
        </section>
      </> : view === 'TR-069' ? <>
        <div className="operations-message is-warning"><span><strong>ACS connection not configured.</strong> This is a device registry only; live CWMP informs, remote configuration, and connection tests are not available until an ACS/CWMP server is connected.</span></div>
        <form className="operations-form panel" onSubmit={(event) => { event.preventDefault(); void createRecord({ ...tr069Form, siteId: tr069Form.siteId || null }) }}>
          <h2>Register a TR-069 device</h2><div className="operations-form-grid">
            <label>Device serial number<input required maxLength={120} value={tr069Form.serialNumber} onChange={(event) => setTr069Form({ ...tr069Form, serialNumber: event.target.value })} /></label>
            <label>Manufacturer<input maxLength={120} value={tr069Form.manufacturer} onChange={(event) => setTr069Form({ ...tr069Form, manufacturer: event.target.value })} /></label>
            <label>Model<input maxLength={120} value={tr069Form.model} onChange={(event) => setTr069Form({ ...tr069Form, model: event.target.value })} /></label>
            <label>Firmware version<input maxLength={120} value={tr069Form.firmwareVersion} onChange={(event) => setTr069Form({ ...tr069Form, firmwareVersion: event.target.value })} /></label>
            <label>Site<select value={tr069Form.siteId} onChange={(event) => setTr069Form({ ...tr069Form, siteId: event.target.value })}><option value="">Unassigned</option>{siteOptions.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
            <label className="operations-wide">Notes<textarea maxLength={2000} rows={2} value={tr069Form.notes} onChange={(event) => setTr069Form({ ...tr069Form, notes: event.target.value })} /></label>
          </div><button type="submit" className="primary-button" disabled={saving}><Plus size={14} /> {saving ? 'Saving…' : 'Register device'}</button>
        </form>
        <RecordTable title="TR-069 device registry" items={filteredItems.length} loading={loading} filter={filter} setFilter={setFilter} filterLabel="Filter devices" emptyText="No TR-069 devices registered." headers={['Serial number', 'Manufacturer / model', 'Firmware', 'Site', 'ACS status', 'Last inform', '']}><tbody>{(filteredItems as Tr069Device[]).map((device) => <tr key={device.id}><td className="mono">{device.serialNumber}</td><td>{[device.manufacturer, device.model].filter(Boolean).join(' · ') || 'Not recorded'}</td><td>{device.firmwareVersion || 'Not recorded'}</td><td>{device.siteName || 'Unassigned'}</td><td><span className="table-status is-disabled">Pending ACS</span></td><td>—</td><td><button type="button" className="text-button danger-text" disabled={saving} aria-label={`Remove ${device.serialNumber}`} onClick={() => void deleteRecord(device.id)}><Trash2 size={14} /></button></td></tr>)}</tbody></RecordTable>
      </> : view === 'Invoices' ? <>
        <div className="operations-stat-grid">{['issued', 'paid', 'void'].map((status) => <article className="metric-card" key={status}><span className="eyebrow">{status} invoices</span><strong className="metric-value">{loading ? '—' : formatAmount(recordCount(totals, status))}</strong><span className="operations-stat-caption">{formatAmount(totals.find((item) => item.status === status)?.amount || 0)} recorded amount</span></article>)}</div>
        <form className="operations-form panel" onSubmit={(event) => { event.preventDefault(); void createRecord(invoiceForm) }}>
          <h2>Generate monthly invoices</h2><p>Creates one issued invoice for each active subscriber with a positive monthly rate. Existing invoices for that month are skipped. This does not email or collect payment.</p>
          <div className="operations-form-grid"><label>Billing month<input required type="month" value={invoiceForm.period} onChange={(event) => setInvoiceForm({ ...invoiceForm, period: event.target.value })} /></label><label>Due date<input required type="date" value={invoiceForm.dueAt} onChange={(event) => setInvoiceForm({ ...invoiceForm, dueAt: event.target.value })} /></label></div>
          <p className="operations-help">{loading ? 'Checking eligible subscribers…' : `${invoiceCustomers.length} active subscribers have a monthly rate set.`}</p>
          <button type="submit" className="primary-button" disabled={saving || loading || !invoiceCustomers.length}><Plus size={14} /> {saving ? 'Generating…' : 'Generate invoices'}</button>
        </form>
        <RecordTable title="Invoice register" items={filteredItems.length} loading={loading} filter={filter} setFilter={setFilter} filterLabel="Filter invoices" emptyText="No invoices found. Generate a billing period to create invoices." headers={['Invoice / subscriber', 'Billing period', 'Due date', 'Amount', 'Status', 'Actions']}><tbody>{(filteredItems as Invoice[]).map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoiceNumber}</strong><span>{invoice.customerName} · {invoice.customerEmail}</span></td><td>{new Date(invoice.periodStart).toLocaleDateString()} – {new Date(invoice.periodEnd).toLocaleDateString()}<span>{invoice.description}</span></td><td>{formatDate(invoice.dueAt)}</td><td>{formatAmount(invoice.amount)}</td><td><span className={`table-status ${invoice.status === 'void' ? 'is-disabled' : ''}`}>{invoice.status}</span></td><td>{invoice.status === 'issued' ? <div className="subscriber-actions"><button type="button" className="text-button" disabled={saving} onClick={() => void updateRecord(invoice.id, { status: 'paid' })}>Mark paid</button><button type="button" className="text-button danger-text" disabled={saving} onClick={() => void updateRecord(invoice.id, { status: 'void' })}>Void</button></div>         : invoice.status === 'draft' ? <button type="button" className="text-button" disabled={saving} onClick={() => void updateRecord(invoice.id, { status: 'issued' })}>Issue</button> : '—'} <button type="button" className="text-button danger-text" disabled={saving} aria-label={`Delete invoice ${invoice.invoiceNumber}`} onClick={() => void deleteRecord(invoice.id, `Delete invoice ${invoice.invoiceNumber}? This permanently removes its billing record and cannot be undone.`)}><Trash2 size={14} /></button></td></tr>)}</tbody></RecordTable>        <div className="operations-export-row"><button type="button" className="outline-button" onClick={downloadInvoices}><ArrowDownToLine size={14} /> Export filtered invoices</button><span>CSV contains the currently filtered rows.</span></div>
      </> : <>
        {view === 'Generate vouchers' && <>
          <section className="voucher-expiry-banner">
            <span className="voucher-expiry-icon"><CalendarClock size={21} /></span>
            <div><strong>Validity starts on first connection</strong><p>Each voucher’s plan timer begins when it first signs in. Its exact expiry date and time are then tracked below.</p></div>
            <span className="voucher-expiry-check"><ShieldCheck size={17} /> RADIUS expiry</span>
          </section>
          <form className="operations-form panel voucher-create-form" onSubmit={(event) => { event.preventDefault(); void createRecord({ ...voucherForm, quantity: Number(voucherForm.quantity) }) }}>
            <div className="voucher-form-heading"><span className="voucher-form-icon"><Ticket size={19} /></span><div><h2>Generate hotspot vouchers</h2><p>Issue secure credentials for the selected plan. Passwords are shown only once.</p></div></div>
            <div className="operations-form-grid">
              <label>Active plan<select required value={voucherForm.packageId} onChange={(event) => setVoucherForm({ ...voucherForm, packageId: event.target.value })}><option value="">Select a plan</option>{availablePackages.map((plan) => <option value={plan.id} key={plan.id}>{plan.name} · {plan.rateLimit} · {formatVoucherValidity(plan.durationSeconds)}</option>)}</select></label>
              <label>Quantity<input required type="number" min="1" max="100" value={voucherForm.quantity} onChange={(event) => setVoucherForm({ ...voucherForm, quantity: event.target.value })} /></label>
            </div>
            <label className="voucher-send-sms"><input type="checkbox" checked={voucherForm.sendSms} onChange={(event) => setVoucherForm({ ...voucherForm, sendSms: event.target.checked })} /><span><strong><MessageCircle size={14} /> Send voucher by SMS</strong><small>Send credentials securely to a Kenyan mobile number. SMS delivery must be configured.</small></span></label>
            {voucherForm.sendSms && <label className="settings-field voucher-sms-phone">Recipient phone<input type="tel" required inputMode="tel" autoComplete="tel" pattern={KENYAN_MOBILE_PHONE_PATTERN} placeholder="07XXXXXXXX or +254XXXXXXXXX" value={voucherForm.phone} onChange={(event) => setVoucherForm({ ...voucherForm, phone: event.target.value })} /><small>Generate one voucher at a time when SMS delivery is selected.</small></label>}
            {voucherForm.packageId && <p className="voucher-plan-expiry"><Clock3 size={14} /> Selected plan validity: <strong>{formatVoucherValidity(availablePackages.find((plan) => plan.id === voucherForm.packageId)?.durationSeconds ?? null)}</strong> after first connection</p>}
            <button type="submit" className="primary-button" disabled={saving || !availablePackages.length || (voucherForm.sendSms && Number(voucherForm.quantity) !== 1)}><Ticket size={14} /> {saving ? 'Generating…' : 'Generate vouchers'}</button>
            {!loading && availablePackages.length === 0 && <p className="operations-help">Create and activate an internet plan before generating vouchers.</p>}
          </form>
          {generatedVouchers.length > 0 && <section className="panel generated-vouchers"><div className="panel-heading"><div><h3>New credentials</h3><span>Save or download these one-time passwords now.</span></div><button type="button" className="outline-button" onClick={downloadGeneratedVouchers}><ArrowDownToLine size={14} /> Download CSV</button></div><div className="table-scroll"><table><thead><tr><th>Username</th><th>Password</th><th>Plan</th><th>Validity / expiry</th></tr></thead><tbody>{generatedVouchers.map((voucher) => <tr key={voucher.id}><td className="mono">{voucher.username}</td><td className="mono">{voucher.password}</td><td>{voucher.packageName}</td><td><strong>{formatVoucherValidity(voucher.validitySeconds)}</strong><span>Starts on first connection</span></td></tr>)}</tbody></table></div></section>}
        </>}
        <section className="operations-stat-grid voucher-stat-grid" aria-label="Voucher status summary">
          {([
            ['ready', 'Ready to use', 'Waiting for first connection', Ticket],
            ['in_use', 'In use', 'Validity timer started', Clock3],
            ['expired', 'Expired', 'Plan validity completed', CalendarClock],
            ['disabled', 'Disabled', 'Blocked by an administrator', ShieldCheck],
          ] as const).map(([key, label, caption, Icon]) => <article className={`voucher-stat-card voucher-stat-${key}`} key={key}><span className="voucher-stat-icon"><Icon size={18} /></span><span className="eyebrow">{label}</span><strong>{loading ? '—' : formatAmount(voucherCounts[key])}</strong><small>{caption}</small></article>)}
        </section>
        <section className="panel operations-panel voucher-register">
          <div className="panel-heading">
            <div><h3>Issued vouchers</h3><span>{loading ? 'Loading records…' : `${filteredVouchers.length} matching vouchers · expiry shown in East Africa Time`}</span></div>
            <div className="voucher-register-tools">
              <input className="record-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search username or plan" aria-label="Search vouchers" />
              <select aria-label="Filter vouchers by status" value={voucherStatusFilter} onChange={(event) => setVoucherStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="ready">Ready</option><option value="in_use">In use</option><option value="expired">Expired</option><option value="disabled">Disabled</option></select>
              <button type="button" className="outline-button" disabled={!filteredVouchers.length} onClick={downloadVoucherRegister}><ArrowDownToLine size={14} /> Export CSV</button>
            </div>
          </div>
          <div className="table-scroll"><table><thead><tr><th>Username</th><th>Plan</th><th>Status</th><th>Created</th><th>First connection</th><th>Expires · EAT</th><th /></tr></thead><tbody>
            {filteredVouchers.map((voucher) => {
              const state = getVoucherState(voucher, voucherNow)
              return <tr key={voucher.id}>
                <td className="mono voucher-username">{voucher.username}</td>
                <td>{voucher.packageName}<span>{formatVoucherValidity(voucher.validitySeconds)}</span></td>
                <td><span className={`voucher-state-chip voucher-state-${state}`}>{state === 'in_use' ? 'In use' : state === 'ready' ? 'Ready' : state}</span></td>
                <td>{formatVoucherDate(voucher.createdAt)}</td>
                <td>{voucher.activatedAt ? formatVoucherDate(voucher.activatedAt) : voucher.validitySeconds ? 'On first sign-in' : 'Not tracked'}</td>
                <td className={state === 'expired' ? 'voucher-expiry-expired' : ''}>{voucher.expiresAt ? formatVoucherDate(voucher.expiresAt) : voucher.validitySeconds ? 'After first sign-in' : 'Not tracked'}</td>
                <td><div className="subscriber-actions">
                  {voucher.status === 'active' && <button type="button" className="text-button danger-text" disabled={saving} onClick={() => void updateRecord(voucher.id, { status: 'disabled' })}>Disable</button>}
                  <button type="button" className="text-button danger-text" disabled={saving} aria-label={`Delete voucher ${voucher.username}`} onClick={() => void deleteRecord(voucher.id, `Delete voucher ${voucher.username}? This permanently removes it and revokes its RADIUS login. Any active session may remain online until it expires.`)}><Trash2 size={14} /> Delete</button>
                </div></td>
              </tr>
            })}
            {!loading && filteredVouchers.length === 0 && <tr><td colSpan={7}>{filter || voucherStatusFilter !== 'all' ? 'No vouchers match these filters.' : 'No vouchers have been generated.'}</td></tr>}
          </tbody></table></div>
          <div className="voucher-register-footer"><span><Clock3 size={14} /> Expiry begins at the voucher’s first successful hotspot connection.</span><span>{items.length} records loaded</span></div>
        </section>
      </>}
    </section>
  )
}

function RecordTable({ title, items, loading, filter, setFilter, filterLabel, emptyText, headers, children }: {
  title: string
  items: number
  loading: boolean
  filter: string
  setFilter: (value: string) => void
  filterLabel: string
  emptyText: string
  headers: string[]
  children: ReactNode
}) {
  return <section className="panel operations-panel"><div className="panel-heading"><div><h3>{title}</h3><span>{loading ? 'Loading records…' : `${items} matching records`}</span></div><input className="record-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={filterLabel} aria-label={filterLabel} /></div><div className="table-scroll"><table><thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead>{children}{!loading && items === 0 && <tbody><tr><td colSpan={headers.length}>{emptyText}</td></tr></tbody>}</table></div></section>
}
