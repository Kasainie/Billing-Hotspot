'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  ChevronLeft,
  Cable,
  Check,
  CircleCheck,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  Globe2,
  LayoutDashboard,
  MessageCircle,
  Menu,
  MoreHorizontal,
  Network,
  Package,
  Palette,
  Plus,
  Router,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Signal,
  SlidersHorizontal,
  Ticket,
  Users,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react'
import { DEFAULT_ROUTER_BRIDGE_NAME, parseServiceSubnet } from '@/lib/router-provisioning'
import { defaultHotspotPortalBranding, hotspotPortalTemplates, isHotspotPortalTemplateId, type HotspotPortalTemplateId } from '@/lib/hotspot-templates'
import { PaymentSettings } from '@/components/payment-settings'
import { PaymentReconciliation } from '@/components/payment-reconciliation'
import { OperationsWorkspace } from '@/components/operations-workspace'
import { LiveHotspotSessions } from '@/components/live-hotspot-sessions'
import { RouterMonitorDetail, type RouterConnectorEnrollment, type RouterMonitorRecord, type RouterMonitorTab } from '@/components/router-monitor-detail'
import { SubscriberProfile, type SubscriberProfileData } from '@/components/subscriber-profile'

const navigationSections: { label?: string; items: { label: string; icon: LucideIcon; count?: string; children?: { label: string; view: string; icon?: LucideIcon }[] }[] }[] = [
  { items: [{ label: 'Overview', icon: LayoutDashboard }] },
  { label: 'CUSTOMERS', items: [
    { label: 'Subscribers', icon: Users },
    { label: 'Leads', icon: Activity },
    { label: 'Tickets', icon: MessageCircle, children: [{ label: 'List', view: 'Ticket list' }, { label: 'Analytics', view: 'Ticket analytics' }] },
  ] },
  { label: 'NETWORK', items: [
    { label: 'Live sessions', icon: Wifi },
    { label: 'Plans', icon: Package },
    { label: 'Portal design', icon: Palette },
    { label: 'Devices', icon: Router, children: [{ label: 'Routers', view: 'Routers', icon: Network }, { label: 'TR-069', view: 'TR-069' }] },
  ] },
  { label: 'FINANCE', items: [
    { label: 'Billing', icon: FileText, children: [{ label: 'Payments', view: 'Payments', icon: CreditCard }, { label: 'Payment settings', view: 'Payment settings', icon: Settings2 }, { label: 'Invoices', view: 'Invoices' }, { label: 'Expenses', view: 'Expenses' }] },
    { label: 'Vouchers', icon: Ticket, children: [{ label: 'List', view: 'Voucher list' }, { label: 'Generate', view: 'Generate vouchers' }, { label: 'Analytics', view: 'Voucher analytics' }] },
  ] },
]

const crudEntityByPage: Partial<Record<string, 'customers' | 'packages' | 'payments' | 'sites'>> = {
  Subscribers: 'customers',
  Plans: 'packages',
  Payments: 'payments',
}

const operationsViewByPage: Partial<Record<string, 'Leads' | 'Ticket list' | 'Ticket analytics' | 'Expenses' | 'Voucher list' | 'Generate vouchers' | 'Voucher analytics' | 'TR-069' | 'Invoices'>> = {
  Leads: 'Leads',
  'Ticket list': 'Ticket list',
  'Ticket analytics': 'Ticket analytics',
  Expenses: 'Expenses',
  'Voucher list': 'Voucher list',
  'Generate vouchers': 'Generate vouchers',
  'Voucher analytics': 'Voucher analytics',
  'TR-069': 'TR-069',
  Invoices: 'Invoices',
}

type WorkspaceMembership = { id: string; name: string; slug: string; role: string }
type DashboardSite = { id: string; name: string; location: string; status: string; customersCount: number }
type DashboardCustomer = { id: string; name: string; email: string; phone: string | null; plan: string | null; expiresAt: string | null }
type DashboardData = {
  sites: DashboardSite[]
  customers: DashboardCustomer[]
  payments: { id: string; customerId: string | null; amount: number; status: string; method: string | null; reference: string | null; paidAt: string }[]
  packages: { id: string; name: string; downloadMbps: number; uploadMbps: number; monthlyPrice: number; active: boolean }[]
  expiringCustomers: DashboardCustomer[]
  summary: { activeCustomers: number; siteCount: number; activePackages: number; paidRevenue: number; paidPaymentCount: number }
}
type SearchResult = { id: string; label: string; detail: string; target: string; type: string }
type HeaderNotification = { id: string; title: string; detail: string; target: string }
type DashboardSections = { metrics: boolean; network: boolean; activity: boolean; operations: boolean }

const emptyDashboardData: DashboardData = {
  sites: [],
  customers: [],
  payments: [],
  packages: [],
  expiringCustomers: [],
  summary: { activeCustomers: 0, siteCount: 0, activePackages: 0, paidRevenue: 0, paidPaymentCount: 0 },
}
const notificationStorageKey = 'lktech-dashboard-read-notifications'
const defaultDashboardSections: DashboardSections = { metrics: true, network: true, activity: true, operations: true }
const dashboardSectionsStorageKey = 'lktech-dashboard-sections'

function escapeCsvField(value: unknown) {
  const text = String(value ?? '')
  const safeText = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safeText.replace(/"/g, '""')}"`
}

function getTimeGreeting() {
  const hour = Number(new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date()))
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Good night'
}

function StatusDot({ tone = 'green' }: { tone?: 'green' | 'amber' | 'red' | 'cyan' }) {
  return <span className={`status-dot status-${tone}`} aria-hidden="true" />
}

function MetricCard({ label, value, icon: Icon, tone, detail }: { label: string; value: string; icon: typeof Activity; tone: string; detail: string }) {
  return (
    <article className="metric-card">
      <div className="metric-top"><span className="eyebrow">{label}</span><span className={`metric-icon ${tone}`}><Icon size={17} /></span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom"><span>{detail}</span></div>
    </article>
  )
}

export function AdminDashboard() {
  const [activeNav, setActiveNav] = useState('Overview')
  const [expandedNav, setExpandedNav] = useState(['Tickets', 'Devices', 'Billing', 'Vouchers'])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchActiveIndex, setSearchActiveIndex] = useState(0)
  const [crudSearchTerm, setCrudSearchTerm] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([])
  const [dashboardData, setDashboardData] = useState<DashboardData>(emptyDashboardData)
  const [siteFilter, setSiteFilter] = useState('All sites')
  const [range, setRange] = useState('30 days')
  const [dashboardSections, setDashboardSections] = useState(defaultDashboardSections)
  const [draftDashboardSections, setDraftDashboardSections] = useState(defaultDashboardSections)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [dashboardNotice, setDashboardNotice] = useState('')
  const [showAllSites, setShowAllSites] = useState(false)
  const [dataStatus, setDataStatus] = useState<'loading' | 'live' | 'error'>('loading')
  const [currentTenantId, setCurrentTenantId] = useState('')
  const [currentTenantName, setCurrentTenantName] = useState('Loading workspace…')
  const [currentUser, setCurrentUser] = useState('')
  const [currentEmail, setCurrentEmail] = useState('')
  const [timeGreeting, setTimeGreeting] = useState('')
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const customizeButtonRef = useRef<HTMLButtonElement>(null)
  const customizeCloseRef = useRef<HTMLButtonElement>(null)
  const wasCustomizeOpenRef = useRef(false)

  useEffect(() => {
    const updateGreeting = () => setTimeGreeting(getTimeGreeting())
    updateGreeting()
    const interval = window.setInterval(updateGreeting, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!currentTenantId) return
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(`${dashboardSectionsStorageKey}:${currentTenantId}`) || 'null')
      if (saved && typeof saved === 'object') {
        const value = saved as Partial<DashboardSections>
        if (Object.keys(defaultDashboardSections).every((key) => typeof value[key as keyof DashboardSections] === 'boolean')) {
          setDashboardSections(value as DashboardSections)
        }
      }
    } catch (error) {
      console.error('Unable to load dashboard layout preferences', error)
      setDashboardNotice('Could not load saved dashboard layout preferences.')
    }
  }, [currentTenantId])

  useEffect(() => {
    if (customizeOpen) customizeCloseRef.current?.focus()
    else if (wasCustomizeOpenRef.current) customizeButtonRef.current?.focus()
    wasCustomizeOpenRef.current = customizeOpen
  }, [customizeOpen])

  useEffect(() => {
    let cancelled = false
    const refreshDashboardData = async () => {
      try {
        const response = await fetch(`/api/dashboard?range=${encodeURIComponent(range)}`, { cache: 'no-store' })
        const body = await response.text()
        if (!body.trim()) {
          throw new Error(`Dashboard request failed (HTTP ${response.status}): server returned an empty response.`)
        }
        let result: unknown
        try {
          result = JSON.parse(body)
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error
          throw new Error(`Dashboard request failed (HTTP ${response.status}): server returned invalid JSON.`)
        }
        if (!response.ok) {
          const errorMessage = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
            ? result.error
            : `Dashboard request failed (HTTP ${response.status}).`
          throw new Error(errorMessage)
        }
        const data = result as DashboardData
        if (!cancelled) {
          setDashboardData(data)
          setDataStatus('live')
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Unable to load dashboard data', error)
          setDataStatus('error')
          setDashboardNotice(error instanceof Error ? error.message : 'Unable to load dashboard data.')
        }
      }
    }
    void refreshDashboardData()
    const interval = window.setInterval(() => void refreshDashboardData(), 60_000)
    window.addEventListener('workspace-data-changed', refreshDashboardData)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('workspace-data-changed', refreshDashboardData)
    }
  }, [range])

  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (response.status === 401) {
          window.location.assign('/login')
          return
        }
        if (!response.ok) throw new Error(data.error || 'Unable to load workspace details.')
        setCurrentTenantId(data.tenant.id)
        setCurrentTenantName(data.tenant.name)
        setCurrentUser(data.user.name)
        setCurrentEmail(data.user.email)
        setMemberships(data.memberships)
      })
      .catch((error) => {
        console.error('Unable to load tenant workspace', error)
        setCurrentTenantName('Workspace unavailable')
      })
  }, [])

  useEffect(() => {
    try {
      const savedIds: unknown = JSON.parse(window.localStorage.getItem(notificationStorageKey) || '[]')
      if (Array.isArray(savedIds) && savedIds.every((id) => typeof id === 'string')) setReadNotificationIds(savedIds)
    } catch (error) {
      console.error('Unable to load dashboard notification state', error)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        searchInputRef.current?.focus()
      } else if (event.key === 'Escape') {
        setSearchOpen(false)
        setNotificationsOpen(false)
        setProfileOpen(false)
        setCustomizeOpen(false)
      }
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (!searchContainerRef.current?.contains(target)) setSearchOpen(false)
      if (!notificationsRef.current?.contains(target)) setNotificationsOpen(false)
      if (!profileRef.current?.contains(target)) setProfileOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  async function switchWorkspace(tenantId: string) {
    const response = await fetch('/api/auth/switch-tenant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId }),
    })
    if (!response.ok) {
      const result = await response.json() as { error?: string }
      window.alert(result.error || 'Unable to switch workspace.')
      return
    }
    window.location.reload()
  }

  async function signOut() {
    const response = await fetch('/api/auth/logout', { method: 'POST' })
    if (!response.ok) {
      window.alert('Unable to sign out. Please try again.')
      return
    }
    window.location.assign('/login')
  }

  const searchResults = useMemo<SearchResult[]>(() => {
    const term = query.trim().toLowerCase()
    const shortcuts: SearchResult[] = [
      { id: 'overview', label: 'Overview', detail: 'Dashboard and network health', target: 'Overview', type: 'Page' },
      { id: 'subscribers', label: 'Subscribers', detail: 'Manage customer accounts', target: 'Subscribers', type: 'Page' },
      { id: 'plans', label: 'Plans', detail: 'Manage internet packages', target: 'Plans', type: 'Page' },
      { id: 'payments', label: 'Payments', detail: 'View billing transactions', target: 'Payments', type: 'Page' },
      { id: 'live-sessions', label: 'Live sessions', detail: 'See connected hotspot devices', target: 'Live sessions', type: 'Page' },
      { id: 'routers', label: 'Routers', detail: 'Provision network devices', target: 'Routers', type: 'Page' },
      { id: 'portal-design', label: 'Portal design', detail: 'Customize the hotspot portal', target: 'Portal design', type: 'Page' },
      { id: 'payment-settings', label: 'Payment settings', detail: 'Configure payment providers', target: 'Payment settings', type: 'Page' },
    ]
    const matchingShortcuts = shortcuts.filter((item) => !term || `${item.label} ${item.detail}`.toLowerCase().includes(term))
    if (!term) return matchingShortcuts

    const records: SearchResult[] = [
      ...dashboardData.customers.map((item) => ({ id: `customer-${item.id}`, label: item.name, detail: `Subscriber · ${item.email}`, target: 'Subscribers', type: 'Subscriber' })),
      ...dashboardData.sites.map((item) => ({ id: `site-${item.id}`, label: item.name, detail: `Site · ${item.location}`, target: 'Overview', type: 'Site' })),
      ...dashboardData.packages.map((item) => ({ id: `package-${item.id}`, label: item.name, detail: `Plan · ${item.downloadMbps}/${item.uploadMbps} Mbps`, target: 'Plans', type: 'Plan' })),
      ...dashboardData.payments.map((item) => ({ id: `payment-${item.id}`, label: item.reference || `Payment ${item.id.slice(0, 8)}`, detail: `Payment · ${item.status} · ${item.amount}`, target: 'Payments', type: 'Payment' })),
    ].filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(term))
    return [...matchingShortcuts, ...records].slice(0, 10)
  }, [dashboardData, query])

  const headerNotifications = useMemo<HeaderNotification[]>(() => {
    const customerNames = new Map(dashboardData.customers.map((customer) => [customer.id, customer.name]))
    const now = Date.now()
    const soon = now + 7 * 24 * 60 * 60 * 1000
    return [
      ...dashboardData.payments
        .filter((payment) => payment.status.toLowerCase() === 'pending')
        .map((payment) => ({
          id: `payment-${payment.id}`,
          title: 'Payment needs attention',
          detail: `${customerNames.get(payment.customerId || '') || payment.reference || 'A payment'} is pending`,
          target: 'Payments',
        })),
      ...dashboardData.sites
        .filter((site) => site.status.toLowerCase() !== 'active')
        .map((site) => ({
          id: `site-${site.id}`,
          title: 'Network site needs attention',
          detail: `${site.name} is ${site.status}`,
          target: 'Overview',
        })),
      ...dashboardData.customers
        .filter((customer) => {
          if (!customer.expiresAt) return false
          const expiration = new Date(customer.expiresAt).getTime()
          return expiration >= now && expiration <= soon
        })
        .map((customer) => ({
          id: `expiry-${customer.id}`,
          title: 'Subscription expiring soon',
          detail: `${customer.name}${customer.plan ? ` · ${customer.plan}` : ''}`,
          target: 'Subscribers',
        })),
    ]
  }, [dashboardData])

  const unreadNotifications = headerNotifications.filter((notification) => !readNotificationIds.includes(notification.id))
  const userInitials = currentUser.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U'

  function markNotificationsRead(ids: string[]) {
    const nextIds = [...new Set([...readNotificationIds, ...ids])]
    setReadNotificationIds(nextIds)
    try {
      window.localStorage.setItem(notificationStorageKey, JSON.stringify(nextIds))
    } catch (error) {
      console.error('Unable to save dashboard notification state', error)
    }
  }

  function openSearchResult(result: SearchResult) {
    setActiveNav(result.target)
    setSearchOpen(false)
    if (result.type === 'Site') {
      setQuery(result.label)
      setShowAllSites(true)
      return
    }
    setQuery('')
    setCrudSearchTerm(result.type === 'Page' ? '' : result.label)
  }

  function openNotification(notification: HeaderNotification) {
    markNotificationsRead([notification.id])
    setActiveNav(notification.target)
    setQuery('')
    setCrudSearchTerm('')
    setNotificationsOpen(false)
  }

  const displayedSites = dashboardData.sites.map((site) => ({
    name: site.name,
    location: site.location,
    code: site.id.slice(0, 6).toUpperCase(),
    customers: site.customersCount,
    status: site.status,
    color: site.status.toLowerCase() === 'active' ? 'cyan' : 'amber',
  }))
  const filteredSites = useMemo(() => displayedSites.filter((site) => `${site.name} ${site.code}`.toLowerCase().includes(query.toLowerCase()) && (siteFilter === 'All sites' || site.name === siteFilter)), [displayedSites, query, siteFilter])
  const visibleSites = showAllSites ? filteredSites : filteredSites.slice(0, 3)
  const customerNames = useMemo(() => new Map(dashboardData.customers.map((customer) => [customer.id, customer.name])), [dashboardData.customers])
  const activeSiteCount = dashboardData.sites.filter((site) => site.status.toLowerCase() === 'active').length
  const networkStatusTone = dataStatus !== 'live' || !dashboardData.sites.length || activeSiteCount !== dashboardData.sites.length ? 'amber' : 'green'

  function formatDashboardValue(value: number) {
    return new Intl.NumberFormat().format(value)
  }

  function openDashboardCustomization() {
    setDraftDashboardSections(dashboardSections)
    setCustomizeOpen(true)
  }

  function saveDashboardCustomization() {
    setDashboardSections(draftDashboardSections)
    setCustomizeOpen(false)
    setDashboardNotice('Dashboard layout saved for this workspace.')
    try {
      if (currentTenantId) {
        window.localStorage.setItem(`${dashboardSectionsStorageKey}:${currentTenantId}`, JSON.stringify(draftDashboardSections))
      }
    } catch (error) {
      console.error('Unable to save dashboard layout preferences', error)
      setDashboardNotice('Dashboard layout updated, but could not be saved on this device.')
    }
  }

  function exportDashboardReport() {
    const rangeMilliseconds = range === '24 hours' ? 24 * 60 * 60 * 1000 : range === '7 days' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
    const generatedAt = Date.now()
    const cutoff = generatedAt - rangeMilliseconds
    const reportRows: unknown[][] = [['Section', 'Name', 'Status', 'Details', 'Amount', 'Date']]

    dashboardData.sites.forEach((site) => {
      reportRows.push(['Site', site.name, site.status, `${site.location}; ${site.customersCount} customers`, '', ''])
    })
    dashboardData.customers.forEach((customer) => {
      reportRows.push(['Subscriber', customer.name, customer.expiresAt ? 'Has expiry' : 'No expiry set', [customer.email, customer.phone, customer.plan].filter(Boolean).join('; '), '', customer.expiresAt || ''])
    })
    dashboardData.payments
      .filter((payment) => {
        const paidAt = new Date(payment.paidAt).getTime()
        return Number.isFinite(paidAt) && paidAt >= cutoff && paidAt <= generatedAt
      })
      .forEach((payment) => {
        reportRows.push(['Payment', payment.reference || payment.id, payment.status, [payment.method, payment.customerId ? `Customer ${payment.customerId}` : ''].filter(Boolean).join('; '), payment.amount, payment.paidAt])
      })
    dashboardData.packages.forEach((plan) => {
      reportRows.push(['Plan', plan.name, plan.active ? 'Active' : 'Inactive', `${plan.downloadMbps}/${plan.uploadMbps} Mbps`, plan.monthlyPrice, ''])
    })

    if (reportRows.length === 1) {
      setDashboardNotice(dataStatus === 'error'
        ? 'Dashboard data could not be loaded. Refresh the page and try again.'
        : 'There are no workspace records to export for the selected period.')
      return
    }

    try {
      const csv = `\uFEFF${reportRows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n')}`
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const safeWorkspaceName = currentTenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
      link.href = url
      link.download = `lktech-${safeWorkspaceName}-report-${new Date(generatedAt).toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDashboardNotice(`Exported ${reportRows.length - 1} loaded records. The selected date range applies to the latest 100 loaded payments; the export includes at most 100 subscribers and payments.`)
    } catch (error) {
      console.error('Unable to export the dashboard report', error)
      setDashboardNotice('Unable to export the report. Please try again.')
    }
  }

  return (
    <main className="ops-shell">
      <aside className={`ops-sidebar ${mobileOpen ? 'is-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div className="brand-row"><div className="brand-mark"><Signal size={18} /></div><div><strong>LKTECH</strong></div><button className="icon-button collapse-button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}>{sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button><button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
        <div className="workspace-picker">
          <select aria-label="Active workspace" value={currentTenantId} onChange={(event) => switchWorkspace(event.target.value)}>
            {currentTenantId && <option value={currentTenantId}>{currentTenantName}</option>}
            {memberships.filter((membership) => membership.id !== currentTenantId).map((membership) => <option key={membership.id} value={membership.id}>{membership.name}</option>)}
          </select>
        </div>
        <nav className="navigation-list" aria-label="Main navigation">{navigationSections.map((section) => <div className="nav-section" key={section.label || 'overview'}>{section.label && <p className="nav-label">{section.label}</p>}{section.items.map(({ label, icon: Icon, count, children }) => <div className="nav-group" key={label}><button className={`nav-item ${activeNav === label ? 'active' : ''}`} aria-expanded={children ? expandedNav.includes(label) : undefined} onClick={() => { if (children) { setExpandedNav((current) => current.includes(label) ? current.filter((group) => group !== label) : [...current, label]); return } setActiveNav(label); setMobileOpen(false) }}><Icon size={17} /><span>{label}</span>{count && <b>{count}</b>}{children && (expandedNav.includes(label) ? <ChevronDown className="nav-chevron" size={15} /> : <ChevronRight className="nav-chevron" size={15} />)}</button>{children && expandedNav.includes(label) && <div className="nav-children">{children.map(({ label: childLabel, view, icon: ChildIcon }) => <button key={view} className={`nav-child ${activeNav === view ? 'active' : ''}`} onClick={() => { setActiveNav(view); setMobileOpen(false) }}>{ChildIcon ? <ChildIcon size={15} /> : <span className="nav-child-dot" />}<span>{childLabel}</span></button>)}</div>}</div>)}</div>)}</nav>
        <div className="sidebar-footer"><div className="support-card"><div className="support-icon"><Cable size={16} /></div><strong>Need help?</strong><span>Check the integration guide</span><a href="#activity">Open docs <ArrowUpRight size={12} /></a></div><div className="user-row"><div className="avatar">{currentUser.slice(0, 2).toUpperCase() || 'U'}</div><div><strong>{currentUser || 'Workspace user'}</strong><span>{currentTenantName}</span></div><button type="button" className="workspace-logout" onClick={signOut}>Sign out</button></div></div>
      </aside>

      <section className="ops-content">
        <header className="topbar"><button className="icon-button menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{activeNav}</strong></div><div className="top-actions">
          <div className="header-search" ref={searchContainerRef}>
            <label className="search-box"><Search size={16} /><input ref={searchInputRef} value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchActiveIndex(0); setSearchOpen(true) }} onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && searchResults.length) { event.preventDefault(); setSearchActiveIndex((index) => (index + 1) % searchResults.length) }
              else if (event.key === 'ArrowUp' && searchResults.length) { event.preventDefault(); setSearchActiveIndex((index) => (index - 1 + searchResults.length) % searchResults.length) }
              else if (event.key === 'Enter' && searchResults[searchActiveIndex]) { event.preventDefault(); openSearchResult(searchResults[searchActiveIndex]) }
            }} placeholder="Search anything" aria-label="Search anything" aria-expanded={searchOpen} aria-controls="dashboard-search-results" role="combobox" aria-autocomplete="list" /><kbd>Ctrl K</kbd></label>
            {searchOpen && <div className="header-popover search-popover" id="dashboard-search-results" role="listbox" aria-label="Search results">
              {searchResults.length ? searchResults.map((result, index) => <button key={result.id} type="button" role="option" aria-selected={index === searchActiveIndex} className={`search-result ${index === searchActiveIndex ? 'is-active' : ''}`} onMouseEnter={() => setSearchActiveIndex(index)} onClick={() => openSearchResult(result)}><span className="search-result-copy"><strong>{result.label}</strong><small>{result.detail}</small></span><span className="search-result-type">{result.type}</span></button>) : <p className="header-empty">No matching pages or records.</p>}
              <div className="search-footer">Search pages and workspace records</div>
            </div>}
          </div>
          <div className="header-menu-anchor" ref={notificationsRef}>
            <button type="button" className="icon-button notification" aria-label={`Notifications${unreadNotifications.length ? `, ${unreadNotifications.length} unread` : ''}`} aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((open) => !open); setProfileOpen(false); setSearchOpen(false) }}><Bell size={17} />{unreadNotifications.length > 0 && <i />}</button>
            {notificationsOpen && <div className="header-popover notification-popover"><div className="popover-heading"><div><strong>Notifications</strong><span>{unreadNotifications.length ? `${unreadNotifications.length} unread` : 'You’re all caught up'}</span></div>{unreadNotifications.length > 0 && <button type="button" className="popover-action" onClick={() => markNotificationsRead(unreadNotifications.map((notification) => notification.id))}>Mark all read</button>}</div>
              {headerNotifications.length ? <div className="notification-list">{headerNotifications.map((notification) => <button key={notification.id} type="button" className={`notification-item ${readNotificationIds.includes(notification.id) ? 'is-read' : ''}`} onClick={() => openNotification(notification)}><span className="notification-status" /><span><strong>{notification.title}</strong><small>{notification.detail}</small></span></button>)}</div> : <p className="header-empty">There are no current account or network alerts.</p>}
            </div>}
          </div>
          <div className="header-menu-anchor" ref={profileRef}>
            <button type="button" className="top-avatar" aria-label={`Account menu for ${currentUser || 'user'}`} aria-expanded={profileOpen} onClick={() => { setProfileOpen((open) => !open); setNotificationsOpen(false); setSearchOpen(false) }}>{userInitials}</button>
            {profileOpen && <div className="header-popover profile-popover"><div className="profile-summary"><div className="profile-avatar">{userInitials}</div><span><strong>{currentUser || 'Workspace user'}</strong><small>{currentEmail}</small></span></div><div className="profile-workspace"><span>ACTIVE WORKSPACE</span><strong>{currentTenantName}</strong></div><button type="button" className="profile-menu-item" onClick={() => { setActiveNav('Payment settings'); setProfileOpen(false) }}><Settings2 size={15} /> Payment settings</button><button type="button" className="profile-menu-item profile-signout" onClick={() => { setProfileOpen(false); void signOut() }}>Sign out</button></div>}
          </div>
        </div></header>
        <div className="page-wrap" data-dashboard-network={dashboardSections.network} data-dashboard-activity={dashboardSections.activity} data-dashboard-operations={dashboardSections.operations}>
          {activeNav === 'Routers' ? <RouterManagement /> : activeNav === 'Live sessions' ? <LiveHotspotSessions /> : activeNav === 'Portal design' ? <PortalTemplatePanel /> : activeNav === 'Payment settings' ? <PaymentSettings /> : activeNav === 'Payments' ? <PaymentReconciliation /> : operationsViewByPage[activeNav] ? <OperationsWorkspace view={operationsViewByPage[activeNav]!} /> : activeNav !== 'Overview' ? crudEntityByPage[activeNav] === 'packages' ? <PackagePanel initialFilter={crudSearchTerm} /> : crudEntityByPage[activeNav] ? <CrudPanel entity={crudEntityByPage[activeNav]!} initialFilter={crudSearchTerm} /> : <ModulePanel title={activeNav} /> : null}
          {activeNav === 'Overview' ? <>
          <div className="page-heading"><div><div className="live-label"><StatusDot tone={networkStatusTone} /> WORKSPACE OVERVIEW</div><h1>{timeGreeting || 'Welcome'}, {currentUser.trim().split(/\s+/)[0] || 'there'}.</h1><p>Workspace records and billing activity for your network.</p></div><div className="heading-actions"><button ref={customizeButtonRef} type="button" className="outline-button" aria-haspopup="dialog" aria-expanded={customizeOpen} onClick={openDashboardCustomization}><SlidersHorizontal size={15} /> Customize</button><button type="button" className="primary-button" onClick={exportDashboardReport}><ArrowDownRight size={15} /> Export report</button></div></div>
          {dashboardNotice && <p className="dashboard-notice" role="status">{dashboardNotice}<button type="button" aria-label="Dismiss message" onClick={() => setDashboardNotice('')}><X size={13} /></button></p>}
          <div className="status-strip">
            <div><span className="status-strip-label">WORKSPACE DATA</span><strong><StatusDot tone={networkStatusTone} />{dataStatus === 'loading' ? 'Loading workspace data' : dataStatus === 'error' ? 'Workspace data unavailable' : dashboardData.sites.length === 0 ? 'No sites configured' : `${activeSiteCount} of ${dashboardData.sites.length} sites marked active`}</strong></div>
            <div className="status-services"><span>{dataStatus === 'live' ? `${dashboardData.summary.activeCustomers.toLocaleString()} active subscribers` : dataStatus === 'loading' ? 'Loading subscriber count' : 'Subscriber count unavailable'}</span><span>{dataStatus === 'live' ? `${dashboardData.summary.activePackages.toLocaleString()} active plans` : dataStatus === 'loading' ? 'Loading plan count' : 'Plan count unavailable'}</span></div>
            <span className="last-sync">{dataStatus === 'live' ? 'Live workspace records' : dataStatus === 'error' ? 'Connection error' : 'Loading…'}</span>
          </div>
          {dashboardSections.metrics && <div className="metrics-grid">
            <MetricCard label={`Paid revenue · ${range}`} value={dataStatus === 'live' ? formatDashboardValue(dashboardData.summary.paidRevenue) : '—'} detail={`${dashboardData.summary.paidPaymentCount.toLocaleString()} paid payments`} icon={CircleDollarSign} tone="cyan" />
            <MetricCard label="Active subscribers" value={dataStatus === 'live' ? formatDashboardValue(dashboardData.summary.activeCustomers) : '—'} detail="From workspace customer records" icon={Users} tone="green" />
            <MetricCard label="Configured sites" value={dataStatus === 'live' ? formatDashboardValue(dashboardData.summary.siteCount) : '—'} detail="From workspace site records" icon={Globe2} tone="blue" />
            <MetricCard label="Active plans" value={dataStatus === 'live' ? formatDashboardValue(dashboardData.summary.activePackages) : '—'} detail="From workspace plan records" icon={Package} tone="amber" />
          </div>}

          <div className="section-toolbar"><div><h2>Network overview</h2><p>Review configured sites and payment totals.</p></div><div className="toolbar-controls"><select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} aria-label="Filter sites"><option>All sites</option>{displayedSites.map((site) => <option key={site.name}>{site.name}</option>)}</select><select value={range} onChange={(event) => setRange(event.target.value)} aria-label="Select time range"><option>30 days</option><option>7 days</option><option>24 hours</option></select></div></div>
          {dashboardSections.network && <div className="overview-grid">
            <section className="panel site-panel">
              <div className="panel-heading"><div><h3>Configured sites</h3><span>{dataStatus === 'live' ? `${dashboardData.sites.length} sites in this workspace` : 'Workspace site records'}</span></div><button type="button" className="text-button" onClick={() => setShowAllSites((value) => !value)} disabled={filteredSites.length <= 3}>{showAllSites ? 'Show less' : 'View all'} <ArrowUpRight size={13} /></button></div>
              {dataStatus === 'loading' ? <p className="header-empty">Loading site records…</p> : dataStatus === 'error' ? <p className="header-empty">Site records are unavailable.</p> : visibleSites.length ? visibleSites.map((site) => <div className="site-row" key={site.code}><div className={`site-icon site-${site.color}`}><Globe2 size={17} /></div><div className="site-info"><strong>{site.name}</strong><span>{site.location || site.code}</span></div><div className="site-stat"><strong>{formatDashboardValue(site.customers)}</strong><span>subscribers</span></div><div className="health"><div><StatusDot tone={site.status.toLowerCase() === 'active' ? 'green' : 'amber'} /></div><span>{site.status}</span></div></div>) : <p className="header-empty">{siteFilter === 'All sites' ? 'No sites have been added to this workspace.' : 'No sites match this filter.'}</p>}
            </section>
            <section className="panel revenue-panel">
              <div className="panel-heading"><div><h3>Payments received</h3><span>Confirmed payments · {range}</span></div></div>
              <div className="revenue-total"><strong>{dataStatus === 'live' ? formatDashboardValue(dashboardData.summary.paidRevenue) : '—'}</strong><span>{dataStatus === 'live' ? `${dashboardData.summary.paidPaymentCount.toLocaleString()} payments` : 'Awaiting live records'}</span></div>
              <p className="dashboard-data-caption">Amounts are shown in the units recorded by your payment data.</p>
            </section>
          </div>}

          {dashboardSections.activity && <div className="lower-grid">
            <section className="panel table-panel"><div className="panel-heading"><div><h3>Recently added subscribers</h3><span>Latest workspace customer records</span></div><button type="button" className="text-button" onClick={() => setActiveNav('Subscribers')}>Manage subscribers <ArrowUpRight size={13} /></button></div><div className="table-scroll"><table><thead><tr><th>Subscriber</th><th>Email</th><th>Plan</th><th>Expiry</th></tr></thead><tbody>{dashboardData.customers.slice(0, 5).map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td>{customer.email}</td><td>{customer.plan || '—'}</td><td>{customer.expiresAt ? new Date(customer.expiresAt).toLocaleDateString() : '—'}</td></tr>)}{dataStatus === 'live' && dashboardData.customers.length === 0 && <tr><td colSpan={4}>No subscribers have been added.</td></tr>}{dataStatus !== 'live' && <tr><td colSpan={4}>{dataStatus === 'loading' ? 'Loading subscriber records…' : 'Subscriber records are unavailable.'}</td></tr>}</tbody></table></div></section>
            <section className="panel payments-panel"><div className="panel-heading"><div><h3>Recent payments</h3><span>Latest payment records</span></div><button type="button" className="text-button" onClick={() => setActiveNav('Payments')}>View payments <ArrowUpRight size={13} /></button></div>{dataStatus === 'live' && dashboardData.payments.length ? dashboardData.payments.slice(0, 5).map((payment) => <div className="payment-row" key={payment.id}><div className="payment-icon"><CreditCard size={15} /></div><div className="payment-info"><strong>{customerNames.get(payment.customerId || '') || payment.reference || 'Payment'}</strong><span>{payment.reference || payment.id} · {payment.method || 'Method not recorded'}</span></div><div className="payment-amount"><strong>{formatDashboardValue(payment.amount)}</strong><span className={payment.status.toLowerCase() === 'paid' ? 'paid' : 'pending'}>{payment.status}</span></div><time>{new Date(payment.paidAt).toLocaleDateString()}</time></div>) : <p className="header-empty">{dataStatus === 'live' ? 'No payment records have been added.' : dataStatus === 'loading' ? 'Loading payment records…' : 'Payment records are unavailable.'}</p>}</section>
          </div>}

          {dashboardSections.operations && <div className="bottom-grid">
            <section className="panel expirations"><div className="panel-heading"><div><h3>Expiring within 7 days</h3><span>Active subscriber accounts</span></div><button type="button" className="text-button" onClick={() => setActiveNav('Subscribers')}>Manage subscribers <ArrowUpRight size={13} /></button></div><div className="expiry-list">{dataStatus === 'live' && dashboardData.expiringCustomers.length ? dashboardData.expiringCustomers.slice(0, 5).map((customer) => <div key={customer.id}><div className="mini-avatar">{customer.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div><span><strong>{customer.name}</strong><small>{[customer.plan, customer.email].filter(Boolean).join(' · ')}</small></span><b>{customer.expiresAt ? new Date(customer.expiresAt).toLocaleDateString() : '—'}</b></div>) : <p className="header-empty">{dataStatus === 'live' ? 'No active subscriptions expire in the next 7 days.' : dataStatus === 'loading' ? 'Loading expiry records…' : 'Expiry records are unavailable.'}</p>}</div></section>
            <section className="panel activity-panel"><div className="panel-heading"><div><h3>Available plans</h3><span>Plans configured in this workspace</span></div><button type="button" className="text-button" onClick={() => setActiveNav('Plans')}>Manage plans <ArrowUpRight size={13} /></button></div><div className="activity-list">{dataStatus === 'live' && dashboardData.packages.length ? dashboardData.packages.slice(0, 5).map((plan) => <div key={plan.id}><div className={`activity-icon ${plan.active ? 'green' : 'amber'}`}><Package size={14} /></div><span><strong>{plan.name}</strong><small>{plan.downloadMbps}/{plan.uploadMbps} Mbps · {plan.active ? 'Active' : 'Inactive'}</small></span></div>) : <p className="header-empty">{dataStatus === 'live' ? 'No plans have been configured.' : dataStatus === 'loading' ? 'Loading plans…' : 'Plan records are unavailable.'}</p>}</div></section>
          </div>}
          </> : null}
          <footer className="footer-bar"><span>LKTECH workspace dashboard</span><span>{dataStatus === 'live' ? 'Live workspace records' : dataStatus === 'error' ? 'Workspace data unavailable' : 'Loading workspace data'}</span></footer>
        </div>
        {customizeOpen && <div className="dashboard-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomizeOpen(false) }}>
          <section className="dashboard-customize-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboard-customize-title" onKeyDown={(event) => {
            if (event.key === 'Tab') {
              const focusable = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
              const first = focusable[0]
              const last = focusable[focusable.length - 1]
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
            }
          }}>
            <div className="dashboard-dialog-heading"><div><span>OVERVIEW SETTINGS</span><h2 id="dashboard-customize-title">Customize dashboard</h2><p>Choose which sections appear on your overview.</p></div><button ref={customizeCloseRef} type="button" className="icon-button" aria-label="Close customization" onClick={() => setCustomizeOpen(false)}><X size={17} /></button></div>
            <div className="dashboard-section-options">
              {([
                ['metrics', 'Workspace summary', 'Recorded payments, active subscribers, sites, and plans'],
                ['network', 'Network overview', 'Site health and revenue performance'],
                ['activity', 'Subscribers and payments', 'Recent customer and payment records'],
                ['operations', 'Operations and plans', 'Subscriptions expiring soon and configured plans'],
              ] as const).map(([key, label, description]) => <label className="dashboard-section-option" key={key}><input type="checkbox" checked={draftDashboardSections[key]} onChange={(event) => setDraftDashboardSections((current) => ({ ...current, [key]: event.target.checked }))} /><span><strong>{label}</strong><small>{description}</small></span></label>)}
            </div>
            <div className="dashboard-dialog-actions"><button type="button" className="outline-button" onClick={() => setCustomizeOpen(false)}>Cancel</button><button type="button" className="primary-button" onClick={saveDashboardCustomization}>Save layout</button></div>
          </section>
        </div>}
      </section>
    </main>
  )
}

type RouterInventory = {
  interfaces: Array<{ name: string; running: boolean; disabled: boolean }>
  bridgePorts: Array<{ interface: string; bridge: string }>
  wanInterfaces: string[]
  bridgeName: string | null
  serviceConfiguration?: {
    bridgeName: string
    ports: string[]
    managedPorts: string[]
    wanPorts: string[]
    services: string[]
    hotspotSubnet: string | null
    pppoeSubnet: string | null
    hotspotAntiSharing: boolean
    preparedAt: string
  }
}

type ProvisioningRecordDetails = {
  createdAt: string | null
  downloadedAt: string | null
  appliedAt: string | null
  configuredAt: string | null
  routerData: RouterInventory | null
}

const defaultHotspotSubnet = '172.31.0.0/24'
const defaultPppoeSubnet = '172.31.1.0/24'
export function RouterProvisioning({
  onExit,
  onProvision,
  initialSiteName = 'Central Hub',
  initialRouterName = 'MikroTik Main',
  exitLabel = 'All routers',
  provisionedLabel = 'View router',
}: {
  onExit: () => void
  onProvision: (routerId?: string) => void
  initialSiteName?: string
  initialRouterName?: string
  exitLabel?: string
  provisionedLabel?: string
}) {
  const [step, setStep] = useState(0)
  const [routerName, setRouterName] = useState(initialRouterName)
  const [siteName, setSiteName] = useState(initialSiteName)
  const [provisioningAdminKey, setProvisioningAdminKey] = useState('')
  const hotspotProfile = 'default'
  const [provisioningId, setProvisioningId] = useState('')
  const [fetchCommand, setFetchCommand] = useState('')
  const [provisioningState, setProvisioningState] = useState<'idle' | 'creating' | 'pending' | 'downloaded' | 'applied' | 'configured' | 'expired' | 'error'>('idle')
  const [provisioningMessage, setProvisioningMessage] = useState('')
  const [provisioningSourceIp, setProvisioningSourceIp] = useState('')
  const [routerMonitorId, setRouterMonitorId] = useState('')
  const [provisioningRecord, setProvisioningRecord] = useState<ProvisioningRecordDetails | null>(null)
  const [routerInventory, setRouterInventory] = useState<RouterInventory | null>(null)
  const [inventoryInitialized, setInventoryInitialized] = useState(false)
  const [manualPorts, setManualPorts] = useState<string[]>([])
  const [manualPortName, setManualPortName] = useState('')
  const [manualPortError, setManualPortError] = useState('')
  const [manualWanPort, setManualWanPort] = useState('')
  const [selectedPorts, setSelectedPorts] = useState<string[]>([])
  const [useCustomSubnet, setUseCustomSubnet] = useState(false)
  const [hotspotSubnet, setHotspotSubnet] = useState(defaultHotspotSubnet)
  const [pppoeSubnet, setPppoeSubnet] = useState(defaultPppoeSubnet)
  const [applyCommand, setApplyCommand] = useState('')
  const [checkingProvisioningStatus, setCheckingProvisioningStatus] = useState(false)
  const [provisioningCheckError, setProvisioningCheckError] = useState('')
  const [preparingConfiguration, setPreparingConfiguration] = useState(false)
  const [configurationError, setConfigurationError] = useState('')
  const [services, setServices] = useState(['PPPoE', 'Hotspot'])
  const [hotspotAntiSharing, setHotspotAntiSharing] = useState(false)
  const [copied, setCopied] = useState<'router' | null>(null)

  const safeIdentity = routerName.trim().replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, ' ').slice(0, 48) || 'MikroTik Main'
  const steps = ['Identity', 'Provision', 'Services', 'Done']
  const requiresProvisioningKey = process.env.NODE_ENV !== 'development'
  const activeHotspotSubnet = useCustomSubnet ? hotspotSubnet : defaultHotspotSubnet
  const activePppoeSubnet = useCustomSubnet ? pppoeSubnet : defaultPppoeSubnet
  const activeBridgeName = routerInventory?.bridgeName || DEFAULT_ROUTER_BRIDGE_NAME
  const hotspotNetwork = parseServiceSubnet(activeHotspotSubnet)
  const pppoeNetwork = parseServiceSubnet(activePppoeSubnet)
  const duplicateServiceNetworks = Boolean(hotspotNetwork && pppoeNetwork && hotspotNetwork.cidr === pppoeNetwork.cidr)
  const toggleService = (service: string) => setServices((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service])
  const togglePort = (port: string) => setSelectedPorts((current) => current.includes(port) ? current.filter((item) => item !== port) : [...current, port])
  const toggleWanPort = (port: string) => {
    setManualWanPort((current) => current === port ? '' : port)
    setSelectedPorts((current) => current.filter((selectedPort) => selectedPort !== port))
  }
  const addManualPort = () => {
    const portName = manualPortName.trim()
    const discoveredPorts = routerInventory?.interfaces.map((port) => port.name) || []
    if (!/^[a-zA-Z0-9_.-]{1,48}$/.test(portName)) {
      setManualPortError('Enter a valid RouterOS interface name.')
      return
    }
    if (discoveredPorts.includes(portName) || manualPorts.includes(portName)) {
      setManualPortError(`${portName} is already listed.`)
      return
    }
    setManualPorts((current) => [...current, portName])
    setManualPortName('')
    setManualPortError('')
  }

  const createRouterConfiguration = async () => {
    const wanInterfaces = new Set([...(routerInventory?.wanInterfaces || []), ...(manualWanPort ? [manualWanPort] : [])])
    const validInterfaces = new Set([...(routerInventory?.interfaces.map((item) => item.name) || []), ...manualPorts])
    const ports = selectedPorts.filter((port) => validInterfaces.has(port) && !wanInterfaces.has(port))
    if (ports.length === 0) {
      setConfigurationError('Select at least one subscriber port; the detected WAN port cannot be bridged.')
      return
    }
    setPreparingConfiguration(true)
    setConfigurationError('')
    try {
      const configuration = {
        ports,
        managedPorts: [...validInterfaces].filter((port) => !wanInterfaces.has(port)),
        wanPorts: [...wanInterfaces],
        services,
        hotspotAntiSharing,
        hotspotSubnet: services.includes('Hotspot') ? activeHotspotSubnet : undefined,
        pppoeSubnet: services.includes('PPPoE') ? activePppoeSubnet : undefined,
      }
      const provisioningToken = fetchCommand.match(/\/provision\/([A-Za-z0-9_-]{43})["/]/)?.[1]
      if (!provisioningToken) throw new Error('Create a new provisioning script before preparing router configuration.')

      const response = await fetch('/api/routers/provisioning', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...(requiresProvisioningKey ? { 'x-provisioning-admin-key': provisioningAdminKey } : {}) },
        body: JSON.stringify({ token: provisioningToken, configuration }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not prepare router configuration.')
      setApplyCommand(result.fetchCommand)
      setStep(3)
    } catch (error) {
      setConfigurationError(error instanceof Error ? error.message : 'Could not prepare router configuration.')
    } finally {
      setPreparingConfiguration(false)
    }
  }

  const copyConfig = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied('router')
      window.setTimeout(() => setCopied(null), 1800)
    } catch {
      setCopied(null)
    }
  }

  const createProvisioningScript = async () => {
    if (!routerName.trim()) return
    if (requiresProvisioningKey && provisioningAdminKey.length < 32) {
      setProvisioningState('error')
      setProvisioningMessage('Enter the deployment provisioning key configured in Vercel.')
      return
    }
    setProvisioningId('')
    setFetchCommand('')
    setProvisioningState('creating')
    setProvisioningMessage('Creating one-time provisioning link...')
    setProvisioningSourceIp('')
    try {
      const response = await fetch('/api/routers/provisioning', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(requiresProvisioningKey ? { 'x-provisioning-admin-key': provisioningAdminKey } : {}) },
        body: JSON.stringify({
          routerName: safeIdentity,
          siteName: siteName.trim(),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not create provisioning link')
      setProvisioningId(result.id)
      setRouterMonitorId(result.monitorId || '')
      setFetchCommand(result.fetchCommand)
      setProvisioningState('pending')
      setProvisioningMessage('Waiting for the router to fetch and apply the script...')
      setStep(1)
    } catch (error) {
      setProvisioningState('error')
      setProvisioningMessage(error instanceof Error ? error.message : 'Could not create provisioning link')
    }
  }

  const checkProvisioningStatus = async () => {
    if (!provisioningId) return
    setCheckingProvisioningStatus(true)
    setProvisioningCheckError('')
    try {
      const response = await fetch(`/api/routers/provisioning?id=${encodeURIComponent(provisioningId)}`, {
        cache: 'no-store',
        headers: requiresProvisioningKey ? { 'x-provisioning-admin-key': provisioningAdminKey } : undefined,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not check router status.')
      setProvisioningState(result.status)
      setProvisioningSourceIp(result.sourceIp || '')
      setProvisioningRecord({
        createdAt: result.createdAt || null,
        downloadedAt: result.downloadedAt || null,
        appliedAt: result.appliedAt || null,
        configuredAt: result.configuredAt || null,
        routerData: result.routerData || null,
      })
      if (result.status === 'configured') setProvisioningMessage('Router services confirmed. This router is ready to go live.')
      else if (result.status === 'applied') setProvisioningMessage('Router is online. Run the Confirm router services command in WinBox.')
      else if (result.status === 'downloaded') setProvisioningMessage('Script downloaded; waiting for RouterOS to finish and confirm.')
      else if (result.status === 'expired') setProvisioningMessage('Provisioning link expired. Create a new script to continue.')
      else setProvisioningMessage('Router has not confirmed configuration yet. Keep the setup page open and try again.')
    } catch (error) {
      setProvisioningCheckError(error instanceof Error ? error.message : 'Could not check router status.')
    } finally {
      setCheckingProvisioningStatus(false)
    }
  }

  const refreshRouterInventory = async () => {
    if (!provisioningId) return
    try {
      const response = await fetch(`/api/routers/provisioning?id=${encodeURIComponent(provisioningId)}`, { cache: 'no-store', headers: requiresProvisioningKey ? { 'x-provisioning-admin-key': provisioningAdminKey } : undefined })
      const result = await response.json()
      if (!response.ok || !result.routerData) return
      const inventory = result.routerData as RouterInventory
      setRouterInventory(inventory)
      if (!inventoryInitialized) {
        const bridgeName = inventory.bridgeName || DEFAULT_ROUTER_BRIDGE_NAME
        setSelectedPorts(inventory.bridgePorts.filter((port) => port.bridge === bridgeName && !inventory.wanInterfaces.includes(port.interface)).map((port) => port.interface))
        setInventoryInitialized(true)
      }
    } catch {
      setProvisioningMessage('Could not refresh router interfaces.')
    }
  }

  useEffect(() => {
    if (!provisioningId) return
    let active = true
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/routers/provisioning?id=${encodeURIComponent(provisioningId)}`, { cache: 'no-store', headers: requiresProvisioningKey ? { 'x-provisioning-admin-key': provisioningAdminKey } : undefined })
        const result = await response.json()
        if (!response.ok || !active) return
        setProvisioningState(result.status)
        setProvisioningSourceIp(result.sourceIp || '')
        setProvisioningRecord({
          createdAt: result.createdAt || null,
          downloadedAt: result.downloadedAt || null,
          appliedAt: result.appliedAt || null,
          configuredAt: result.configuredAt || null,
          routerData: result.routerData || null,
        })
        if (result.routerData) {
          const inventory = result.routerData as RouterInventory
          setRouterInventory(inventory)
          if (!inventoryInitialized) {
            const bridgeName = inventory.bridgeName || DEFAULT_ROUTER_BRIDGE_NAME
            const existingPorts = inventory.bridgePorts
              .filter((port) => port.bridge === bridgeName && !inventory.wanInterfaces.includes(port.interface))
              .map((port) => port.interface)
            setSelectedPorts(existingPorts)
            setInventoryInitialized(true)
          }
        }
        if (result.status === 'applied') {
          setProvisioningMessage(result.routerData?.interfaces?.length ? 'MikroTik is online' : 'Router online; add bridge ports manually or refresh discovery')
          setStep((currentStep) => currentStep < 2 ? 2 : currentStep)
        }
        else if (result.status === 'configured') setProvisioningMessage('Router services confirmed. This router is ready to go live.')
        else if (result.status === 'downloaded') setProvisioningMessage('Script downloaded; waiting for RouterOS to finish and confirm')
        else if (result.status === 'expired') setProvisioningMessage('Provisioning link expired. Create a new script to continue.')
        else setProvisioningMessage('Waiting for the router to fetch and apply the script...')
      } catch {
        if (active) setProvisioningMessage('Could not check router status. Retrying automatically...')
      }
    }

    void checkStatus()
    const timer = window.setInterval(checkStatus, 2500)
    return () => { active = false; window.clearInterval(timer) }
  }, [provisioningId, provisioningAdminKey, requiresProvisioningKey, inventoryInitialized])

  const createScriptButtonLabel = provisioningState === 'creating' ? 'Creating script...' : fetchCommand ? 'Create a new script' : 'Create WinBox script'
  const provisionExpiryNote = 'This one-time script link expires in 15 minutes.'
  const availablePorts = [...new Set([...(routerInventory?.interfaces.map((port) => port.name) || []), ...manualPorts])]
  const hasDiscoveredPorts = Boolean(routerInventory?.interfaces.length)
  const wanPorts = [...new Set([...(routerInventory?.wanInterfaces || []), ...(manualWanPort ? [manualWanPort] : [])])]
  const confirmedConfiguration = provisioningRecord?.routerData?.serviceConfiguration
  const provisioningEvents = [
    { label: 'Provisioning link created', at: provisioningRecord?.createdAt },
    { label: 'Router contacted LKTECH', at: provisioningRecord?.downloadedAt },
    { label: 'Router identity and RADIUS setup applied', at: provisioningRecord?.appliedAt },
    { label: 'Subscriber services confirmed by RouterOS', at: provisioningRecord?.configuredAt },
  ].filter((event): event is { label: string; at: string } => Boolean(event.at))
  const formatProvisioningTime = (timestamp: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))

  return (
    <section className="provisioning-workspace">
      <div className="provisioning-heading">
        <div className="provisioning-breadcrumb"><span>NETWORK</span><span className="breadcrumb-rule" /><span>ROUTERS</span></div>
        <h1>Link a <span>MikroTik.</span></h1>
        <p>Register your router, paste the provisioning script in RouterOS, then choose subscriber services.</p>
      </div>

      <ol className="provisioning-steps" aria-label="Router setup progress">
        {steps.map((label, index) => <li className={index === step ? 'current' : index < step ? 'complete' : ''} key={label}><span className="step-number">{index < step ? <Check size={15} /> : index + 1}</span><span className="step-label">{label}</span>{index < steps.length - 1 && <span className="step-connector" />}</li>)}
      </ol>

      <section className="provision-card" aria-live="polite">
        {step === 0 && <>
          <div className="provision-card-heading"><h2>Router identity</h2><p>Router details and RADIUS connection.</p></div>
          <div className="provision-fields">
            <label>Router name<input value={routerName} maxLength={48} onChange={(event) => setRouterName(event.target.value)} placeholder="e.g. MikroTik Main" /></label>
            <label>Network site<input value={siteName} maxLength={64} onChange={(event) => setSiteName(event.target.value)} placeholder="e.g. Central Hub" /></label>
            {requiresProvisioningKey && <label>Provisioning admin key<input type="password" value={provisioningAdminKey} onChange={(event) => setProvisioningAdminKey(event.target.value)} placeholder="Vercel PROVISIONING_ADMIN_KEY" autoComplete="off" /></label>}
          </div>

          <button className="primary-button provision-subscribers-button" onClick={createProvisioningScript} disabled={!routerName.trim() || !siteName.trim() || provisioningState === 'creating' || (requiresProvisioningKey && provisioningAdminKey.length < 32)}>{createScriptButtonLabel}</button>
          {provisioningState === 'error' && <p className="router-discovery-status error" role="status">{provisioningMessage}</p>}
        </>}

        {step === 1 && <>
          <div className="provision-card-heading"><h2>Provisioning script</h2><p>Open WinBox → New Terminal and paste this one-liner.</p></div>

          <div className="device-mode-warning" role="status">
            <div className="warning-header">
              <AlertTriangle size={18} />
              <span>Device mode not allowed</span>
              <button type="button" className="warning-toggle" aria-label="Toggle advisory">advisory</button>
            </div>
            <p>If the router returns this error after pasting the script, switch to advanced mode before retrying:</p>
            <ol>
              <li>Open the MikroTik terminal (WinBox → New Terminal)</li>
              <li>Unplug the power cord for 10 seconds, then restore power</li>
              <li>Re-run the provisioning command above</li>
            </ol>
          </div>

          <div className="script-frame">
            <pre>{fetchCommand || 'Provisioning command is unavailable. Create a new script to continue.'}</pre>
            <button className="script-copy" disabled={!fetchCommand} onClick={() => copyConfig(fetchCommand)}><Copy size={14} />{copied === 'router' ? 'Copied' : 'Copy script'}</button>
          </div>

          <div className={`provision-notice ${provisioningState === 'applied' || provisioningState === 'configured' ? '' : 'pending-notice'}`} role="status">{provisioningState === 'applied' || provisioningState === 'configured' ? <CircleCheck size={17} /> : provisioningState === 'error' || provisioningState === 'expired' ? <AlertTriangle size={17} /> : <Clock3 size={17} />}<span>{provisioningMessage || 'Checking connection...'}{provisioningState === 'applied' && provisioningSourceIp ? ` at ${provisioningSourceIp}` : ''}</span></div>
        </>}

        {step === 2 && <>
          <div className="provision-card-heading"><h2>Service types</h2><p>Choose what this router should run for subscribers.</p></div>
          <section className="router-setup-section">
            <p className="router-setup-hint">Select one or both services to configure.</p>
            <div className="service-options">{['PPPoE', 'Hotspot'].map((service) => <label className="service-option" key={service}><input type="checkbox" checked={services.includes(service)} onChange={() => toggleService(service)} /><span><strong>{service}</strong><small>{service === 'PPPoE' ? 'Always-on broadband subscribers' : 'Captive portal & vouchers'}</small></span></label>)}</div>
            {services.includes('Hotspot') && <label className="anti-sharing-option"><input type="checkbox" checked={hotspotAntiSharing} onChange={(event) => setHotspotAntiSharing(event.target.checked)} /><span><strong>Enable Hotspot Anti-Sharing Protection</strong><small>Prevents users from sharing their hotspot connection with multiple devices. This modifies TTL values to detect and block sharing attempts; one user, one connection.</small></span></label>}
          </section>

          <section className="router-setup-section">
            <div className="router-setup-title"><div><h2>Bridge ports</h2><p>Interfaces that join {activeBridgeName} for subscriber traffic.</p></div><button className="text-button" onClick={refreshRouterInventory}>Refresh</button></div>
            <p className="router-setup-hint">Subscriber bridge is selected automatically: <strong>{activeBridgeName}</strong>.</p>
            <div className="uplink-warning"><AlertTriangle size={16} /><div><strong>Don't bridge the uplink port</strong><p>{wanPorts.length ? `${wanPorts.join(', ')} ${routerInventory?.wanInterfaces.length ? 'runs the router\'s DHCP client' : 'is marked as the uplink/WAN'}. Adding it to ${activeBridgeName} can cut off internet access; leave it unselected.` : 'No DHCP uplink was detected. Mark the WAN port below before selecting subscriber interfaces.'}</p></div></div>
            {availablePorts.length > 0 ? <div className="router-port-list">{availablePorts.map((portName) => {
              const isWan = wanPorts.includes(portName)
              const existingBridge = routerInventory?.bridgePorts.find((item) => item.interface === portName)?.bridge
              const lockedToOtherBridge = Boolean(existingBridge && existingBridge !== activeBridgeName)
              return <div className="router-port-row" key={portName}>
                <label className={`router-port${selectedPorts.includes(portName) ? ' selected' : ''}${isWan || lockedToOtherBridge ? ' unavailable' : ''}`}>
                  <input type="checkbox" checked={selectedPorts.includes(portName)} disabled={isWan || lockedToOtherBridge} onChange={() => togglePort(portName)} />
                  <span><strong>{portName}</strong><small>{isWan ? 'Uplink / WAN · leave unselected' : lockedToOtherBridge ? `Already on ${existingBridge}` : existingBridge || 'Add to subscriber bridge'}</small></span>
                  {isWan && <b>UPLINK / WAN</b>}
                </label>
                {!isWan && <button type="button" className="router-port-wan-toggle" aria-pressed={manualWanPort === portName} onClick={() => toggleWanPort(portName)}>{manualWanPort === portName ? 'Marked WAN' : 'Mark WAN'}</button>}
              </div>
            })}</div> : <p className="router-setup-hint">{routerInventory ? 'No ports were received from the router. Add the interface names shown in WinBox below.' : 'Waiting for router interface discovery. Keep the provisioning page open.'}</p>}
            <p className="router-setup-hint">Only checked ports carry subscriber services. Existing members of this bridge that are unchecked will be removed when the script runs; ports on other bridges and marked WAN ports are left unchanged.</p>
            {!hasDiscoveredPorts && <div className="manual-port-entry">
              <label htmlFor="manual-router-port">Interface name</label>
              <div><input id="manual-router-port" value={manualPortName} maxLength={48} onChange={(event) => setManualPortName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addManualPort() } }} placeholder="e.g. ether2" /><button type="button" className="manual-port-add" onClick={addManualPort}>Add port</button></div>
              {manualPortError && <p className="router-discovery-status error" role="alert">{manualPortError}</p>}
            </div>}
          </section>

          <section className="router-setup-section subnet-section">
            <div className="router-setup-title"><div><h2>Subnet</h2><p>Optional custom networks. Defaults to 172.31.0.0/24 for Hotspot and 172.31.1.0/24 for PPPoE.</p></div></div>
            <label className="subnet-toggle"><input type="checkbox" checked={useCustomSubnet} onChange={(event) => setUseCustomSubnet(event.target.checked)} /><span>Use custom subnet</span></label>
            {useCustomSubnet && <>
              {services.includes('Hotspot') && <label className="subnet-input">Hotspot and DHCP network<input value={hotspotSubnet} onChange={(event) => setHotspotSubnet(event.target.value)} aria-invalid={!hotspotNetwork} placeholder={defaultHotspotSubnet} /></label>}
              {services.includes('PPPoE') && <label className="subnet-input">PPPoE address pool<input value={pppoeSubnet} onChange={(event) => setPppoeSubnet(event.target.value)} aria-invalid={!pppoeNetwork} placeholder={defaultPppoeSubnet} /></label>}
            </>}
            <p className="router-setup-hint">Hotspot creates a DHCP pool, RADIUS login profile, portal, and NAT rule. PPPoE creates a RADIUS-backed server and address pool. The script stops if an unmanaged server already uses the selected bridge.</p>
            {duplicateServiceNetworks && <p className="router-discovery-status error" role="alert">Hotspot and PPPoE must use different networks.</p>}
            {((services.includes('Hotspot') && !hotspotNetwork) || (services.includes('PPPoE') && !pppoeNetwork)) && <p className="router-discovery-status error" role="alert">Enter a private network ending in `.0/24`, such as 172.31.0.0/24.</p>}
          </section>

          {configurationError && <p className="router-discovery-status error" role="alert">{configurationError}</p>}
          <button className="wizard-next apply-router-config" disabled={preparingConfiguration || (!routerInventory && manualPorts.length === 0) || !selectedPorts.some((port) => !wanPorts.includes(port)) || services.length === 0 || (services.includes('Hotspot') && !hotspotNetwork) || (services.includes('PPPoE') && !pppoeNetwork) || duplicateServiceNetworks} onClick={createRouterConfiguration}>{preparingConfiguration ? 'Preparing configuration...' : 'Apply configuration'}<ArrowRight size={15} /></button>
        </>}

        {step === 3 && provisioningState === 'configured' ? <>
          <div className="router-live-heading"><span className="router-live-icon"><CircleCheck size={24} /></span><div><h2>Router setup complete</h2><p>RouterOS confirmed that the selected services were applied.</p></div><span className="router-live-status"><i />CONFIGURED</span></div>
          <div className="router-live-details">
            <div><span>ROUTER</span><strong>{safeIdentity}</strong></div>
            <div><span>NETWORK SITE</span><strong>{siteName || 'Not reported'}</strong></div>
            <div><span>ROUTER SOURCE IP · NOT VPN</span><strong>{provisioningSourceIp || 'Not reported'}</strong></div>
            <div><span>BRIDGE</span><strong>{confirmedConfiguration?.bridgeName || 'Not reported'}</strong></div>
          </div>
          <section className="router-live-section">
            <h3>Configured services</h3>
            <div className="router-live-tags">{(confirmedConfiguration?.services || []).map((service) => <span key={service}>{service}</span>)}</div>
            <dl>
              <div><dt>Subscriber ports</dt><dd>{confirmedConfiguration?.ports.join(', ') || 'Not reported'}</dd></div>
              {confirmedConfiguration?.services.includes('Hotspot') && <div><dt>Hotspot network</dt><dd>{confirmedConfiguration.hotspotSubnet || 'Not reported'}{confirmedConfiguration.hotspotAntiSharing ? ' · anti-sharing enabled' : ''}</dd></div>}
              {confirmedConfiguration?.services.includes('PPPoE') && <div><dt>PPPoE pool</dt><dd>{confirmedConfiguration.pppoeSubnet || 'Not reported'}</dd></div>}
            </dl>
          </section>
          <section className="router-live-section router-live-activity">
            <h3>Configuration activity</h3>
            {provisioningEvents.length > 0 ? <ol>{provisioningEvents.map((event) => <li key={event.label}><span className="activity-dot" /><span><strong>{event.label}</strong><time>{formatProvisioningTime(event.at)}</time></span></li>)}</ol> : <p>Confirmation timestamps are not available.</p>}
          </section>
          <div className="router-live-actions">
            <button type="button" className="outline-button" onClick={onExit}>{exitLabel}</button>
            <button type="button" className="primary-button" onClick={() => onProvision(routerMonitorId || undefined)}>{provisionedLabel}<ArrowRight size={15} /></button>
          </div>
        </> : step === 3 && <>
          <div className="provision-card-heading"><h2>Confirm router services</h2><p>Paste this command in WinBox → New Terminal. It applies the selected settings and sends confirmation back to LKTECH.</p></div>
          <div className="script-frame"><pre>{applyCommand}</pre><button className="script-copy" onClick={() => copyConfig(applyCommand)}><Copy size={14} />{copied === 'router' ? 'Copied' : 'Copy script'}</button></div>
          <div className="provision-notice pending-notice"><AlertTriangle size={17} /><span>The detected WAN port is protected. Unchecked ports already on {activeBridgeName} will be removed from that bridge; this disconnects devices on those ports. Ports assigned to other bridges are left alone.</span></div>
          <div className={`provision-notice ${provisioningState === 'configured' ? '' : 'pending-notice'}`} role="status">{provisioningState === 'configured' ? <CircleCheck size={17} /> : <Clock3 size={17} />}<span>{provisioningState === 'configured' ? 'RouterOS confirmed that the service configuration was applied.' : 'Run the command above in the MikroTik terminal. Confirmation normally arrives within seconds.'}</span></div>
          {provisioningState !== 'configured' && <div className="provision-confirm-actions"><p>Go live unlocks after the router confirms setup. If you already ran the command, check its status here.</p><button type="button" className="outline-button" onClick={() => void checkProvisioningStatus()} disabled={checkingProvisioningStatus}>{checkingProvisioningStatus ? 'Checking…' : 'Check status'}</button></div>}
          {provisioningCheckError && <p className="router-discovery-status error" role="alert">{provisioningCheckError}</p>}
          <div className="provision-summary"><div><span>ROUTER</span><strong>{safeIdentity}</strong></div><div><span>BRIDGE PORTS</span><strong>{selectedPorts.filter((port) => !routerInventory?.wanInterfaces.includes(port)).join(', ')}</strong></div><div><span>SERVICES</span><strong>{services.join(', ')}</strong></div></div>
        </>}
      </section>

      {!(step === 3 && provisioningState === 'configured') && <div className="provision-footer">
        <button className="wizard-back" onClick={() => step === 0 ? onExit() : setStep((current) => current - 1)}><ArrowLeft size={15} />Back</button>
        {step < steps.length - 1 && step !== 2 && <button className="wizard-next" disabled={(step === 0 && (!routerName.trim() || !fetchCommand || (requiresProvisioningKey && provisioningAdminKey.length < 32))) || (step === 1 && provisioningState !== 'applied')} onClick={() => setStep((current) => current + 1)}>{step === 0 ? 'Provision' : 'Configure services'}<ArrowRight size={15} /></button>}
        {step === steps.length - 1 && <button className="wizard-next" disabled={provisioningState !== 'configured'} onClick={() => onProvision()}>Go live<Check size={15} /></button>}
      </div>}
    </section>
  )
}

type RouterSessionsSummary = { activeSessions: number; connectedDevices: number; sessions: unknown[]; error?: string }
type RouterListResponse = {
  routers: RouterMonitorRecord[]
  summary: { total: number; online: number; offline: number }
  error?: string
}
type RouterInstallScript = { script: string; routerName: string }
type RouterFilter = 'all' | 'online' | 'offline'

function getRouterWebConsoleUrl(router: RouterMonitorRecord) {
  if (router.webEnabled !== true || !router.webScheme || !router.webPort || !router.lastSourceIp) return null
  const host = router.lastSourceIp.includes(':') ? `[${router.lastSourceIp}]` : router.lastSourceIp
  return `${router.webScheme}://${host}:${router.webPort}`
}

function RouterManagement() {
  const [routers, setRouters] = useState<RouterMonitorRecord[]>([])
  const [summary, setSummary] = useState({ total: 0, online: 0, offline: 0 })
  const [activeSessions, setActiveSessions] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [filterStatus, setFilterStatus] = useState<RouterFilter>('all')
  const [showProvisioning, setShowProvisioning] = useState(false)
  const [provisioningRouterName, setProvisioningRouterName] = useState('MikroTik Main')
  const [provisioningSiteName, setProvisioningSiteName] = useState('Central Hub')
  const [routerDetailTab, setRouterDetailTab] = useState<RouterMonitorTab>('System')
  const [selectedRouterId, setSelectedRouterId] = useState('')
  const [installScript, setInstallScript] = useState<RouterInstallScript | null>(null)
  const [scriptBusy, setScriptBusy] = useState(false)
  const [scriptCopied, setScriptCopied] = useState(false)
  const [copiedError, setCopiedError] = useState('')
  const loadInFlight = useRef(false)

  const load = useCallback(async () => {
    if (loadInFlight.current) return
    loadInFlight.current = true
    setRefreshing(true)
    const [routersResult, sessionsResult] = await Promise.allSettled([
      fetch('/api/routers', { cache: 'no-store' }).then(async (response) => {
        const result = await response.json() as RouterListResponse
        if (!response.ok) throw new Error(result.error || 'Unable to load router monitors.')
        return result
      }),
      fetch('/api/hotspot/sessions', { cache: 'no-store' }).then(async (response) => {
        const result = await response.json() as RouterSessionsSummary
        if (!response.ok) throw new Error(result.error || 'Unable to load live session totals.')
        return result
      }),
    ])

    const errors: string[] = []
    if (routersResult.status === 'fulfilled') {
      setRouters(routersResult.value.routers)
      setSummary(routersResult.value.summary)
    } else errors.push(routersResult.reason instanceof Error ? routersResult.reason.message : 'Unable to load router monitors.')
    if (sessionsResult.status === 'fulfilled') setActiveSessions(sessionsResult.value.activeSessions)
    else {
      setActiveSessions(null)
      errors.push(sessionsResult.reason instanceof Error ? sessionsResult.reason.message : 'Unable to load live session totals.')
    }
    setError(errors.length ? errors.join(' ') : '')
    setLoading(false)
    setRefreshing(false)
    loadInFlight.current = false
  }, [])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 1_000)
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', refreshOnFocus)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [load])

  const filteredRouters = useMemo(() => {
    const term = filter.trim().toLowerCase()
    return routers.filter((router) =>
      `${router.routerName} ${router.location}`.toLowerCase().includes(term) &&
      (filterStatus === 'all' || router.status === filterStatus))
  }, [filter, filterStatus, routers])
  const selectedRouter = routers.find((router) => router.id === selectedRouterId)
  const beginReprovision = (router: RouterMonitorRecord) => {
    setProvisioningRouterName(router.routerName)
    setProvisioningSiteName(router.siteName)
    setShowProvisioning(true)
  }
  const beginNewProvision = () => {
    setProvisioningRouterName('MikroTik Main')
    setProvisioningSiteName('Central Hub')
    setShowProvisioning(true)
  }

  const generateMonitorScript = async (router: RouterMonitorRecord) => {
    setSelectedRouterId(router.id)
    setScriptBusy(true)
    setCopiedError('')
    try {
      const endpoint = router.monitored
        ? `/api/routers/${encodeURIComponent(router.id)}/monitoring`
        : '/api/routers/monitoring'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: router.monitored
          ? undefined
          : JSON.stringify({ siteId: router.siteId, routerName: router.routerName }),
      })
      const result = await response.json() as RouterInstallScript & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to prepare a monitoring install script.')
      setInstallScript(result)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to prepare a monitoring install script.')
    } finally {
      setScriptBusy(false)
    }
  }

  const removeRouterMonitor = async (router: RouterMonitorRecord) => {
    const response = await fetch(`/api/routers/${encodeURIComponent(router.id)}/monitoring`, { method: 'DELETE' })
    const result = response.status === 204 ? null : await response.json() as { error?: string }
    if (!response.ok) throw new Error(result?.error || 'Unable to delete router monitoring.')
    const remainingRouters = routers.filter((item) => item.siteId !== router.siteId)
    setRouters(remainingRouters)
    setSummary({
      total: remainingRouters.length,
      online: remainingRouters.filter((item) => item.status === 'online').length,
      offline: remainingRouters.filter((item) => item.status === 'offline').length,
    })
    setSelectedRouterId('')
    window.dispatchEvent(new Event('workspace-data-changed'))
    await load()
  }

  const confirmRemoveRouter = async (router: RouterMonitorRecord) => {
    if (!window.confirm(`Delete router ${router.routerName} and its linked network site? Other routers attached to the site will also be deleted. Customer and equipment records will be kept.`)) return
    setError('')
    try {
      await removeRouterMonitor(router)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete router monitoring.')
    }
  }

  const copyMonitorScript = async () => {
    if (!installScript) return
    try {
      await navigator.clipboard.writeText(installScript.script)
      setScriptCopied(true)
      setCopiedError('')
    } catch {
      setCopiedError('Could not copy the script. Select the script text and copy it manually.')
    }
  }

  if (showProvisioning) {
    return <RouterProvisioning
      initialRouterName={provisioningRouterName}
      initialSiteName={provisioningSiteName}
      onExit={() => { setShowProvisioning(false); void load() }}
      onProvision={(routerId) => {
        setShowProvisioning(false)
        if (routerId) {
          setRouterDetailTab('System')
          setSelectedRouterId(routerId)
        }
        void load()
      }}
    />
  }

  if (selectedRouter) {
    return <>
      <RouterMonitorDetail
        router={selectedRouter}
        initialTab={routerDetailTab}
        onBack={() => setSelectedRouterId('')}
        onReprovision={() => void generateMonitorScript(selectedRouter)}
        onEnableConnector={async () => {
          const response = selectedRouter.monitored
            ? await fetch(`/api/routers/${encodeURIComponent(selectedRouter.id)}/connector`, { method: 'POST' })
            : await fetch('/api/routers/monitoring', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                siteId: selectedRouter.siteId,
                routerName: selectedRouter.routerName,
                mode: 'connector',
              }),
            })
          const result = await response.json() as RouterConnectorEnrollment & { error?: string }
          if (!response.ok) throw new Error(result.error || 'Unable to enable the router API connector.')
          setRouters((current) => current.map((router) => router.id === selectedRouter.id
            ? { ...router, monitored: true, connectorEnabled: true, connectorLastSeenAt: null }
            : router))
          return result
        }}
        onRemove={() => removeRouterMonitor(selectedRouter)}
      />
      {scriptBusy && <p className="router-detail-script-status" role="status">Preparing a new one-time monitor script…</p>}
      {installScript && <div className="router-script-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setInstallScript(null) }}>
        <section className="router-script-modal panel" role="dialog" aria-modal="true" aria-labelledby="router-script-title">
          <div className="router-script-modal-heading"><div><span>SECURE ROUTER MONITORING</span><h2 id="router-script-title">Install on {installScript.routerName}</h2><p>Copy this script into the MikroTik terminal once. It creates a startup scheduler and reports metrics automatically every minute; no separate computer or VPS is needed. The script contains a private monitor token, so do not share it.</p></div><button type="button" aria-label="Close" onClick={() => { setInstallScript(null); setScriptCopied(false); setCopiedError('') }}><X size={17} /></button></div>
          <label className="router-script-label">RouterOS install script<textarea readOnly value={installScript.script} rows={10} onFocus={(event) => event.currentTarget.select()} /></label>
          {copiedError && <p className="router-discovery-status error" role="alert">{copiedError}</p>}
          <div className="router-script-modal-actions"><button type="button" className="outline-button" onClick={() => { setInstallScript(null); setScriptCopied(false); setCopiedError('') }}>Close</button><button type="button" className="router-link-button" onClick={() => void copyMonitorScript()}><Copy size={14} /> {scriptCopied ? 'Copied' : 'Copy script'}</button></div>
        </section>
      </div>}
    </>
  }

  return (
    <section className="router-management">
      <div className="router-management-heading">
        <div>
          <div className="router-management-breadcrumb"><span>NETWORK</span><span aria-hidden="true">—</span><span>ROUTERS</span></div>
          <h1>NAS &amp; <span>routers.</span></h1>
          <p>Link a router, paste the script, go live with PPPoE or Hotspot. <button type="button" className="router-learn-link" onClick={beginNewProvision}>Learn more <ArrowRight size={12} /></button></p>
        </div>
        <button type="button" className="router-link-button" onClick={beginNewProvision}><Plus size={15} /> Link MikroTik</button>
      </div>

      {error && <p className="dashboard-notice" role="alert">{error}</p>}

      <div className="router-metrics">
        <article><span>ROUTERS</span><strong>{loading ? '—' : summary.total.toLocaleString()}</strong><small>registered network devices</small></article>
        <article><span>ONLINE</span><strong>{loading ? '—' : summary.online.toLocaleString()}</strong><small>report received in last 90 seconds</small></article>
        <article><span>OFFLINE</span><strong>{loading ? '—' : summary.offline.toLocaleString()}</strong><small>no recent heartbeat</small></article>
        <article><span>LIVE SESSIONS</span><strong>{activeSessions === null ? '—' : activeSessions.toLocaleString()}</strong><small>open RADIUS sessions workspace-wide</small></article>
      </div>

      <div className="router-list-toolbar">
        <div className="router-list-filters" aria-label="Filter routers by monitoring status">
          {([
            ['all', 'All', summary.total],
            ['online', 'Online', summary.online],
            ['offline', 'Offline', summary.offline],
          ] as const).map(([value, label, count]) => <button key={value} type="button" className={filterStatus === value ? 'active' : ''} aria-pressed={filterStatus === value} onClick={() => setFilterStatus(value)}>{label}<span>{loading ? '—' : count}</span></button>)}
        </div>
        <label className="router-search"><Search size={15} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search name or location…" aria-label="Search routers by name or location" />{filter && <button type="button" aria-label="Clear search" onClick={() => setFilter('')}><X size={14} /></button>}</label>
      </div>

      <div className="router-table-wrap">
        <div className="table-scroll">
          <table className="router-management-table">
            <thead><tr><th>ROUTER</th><th>STATUS</th><th>SESSIONS</th><th>WINBOX</th><th>WEB</th><th>LAST ONLINE</th><th /></tr></thead>
            <tbody>
              {filteredRouters.map((router) => {
                const webConsoleUrl = getRouterWebConsoleUrl(router)
                return (
                <tr key={router.id}>
                  <td><button type="button" className="router-name-open" onClick={() => { setRouterDetailTab('System'); setSelectedRouterId(router.id) }}>{router.routerName}</button><span>{router.lastSourceIp ? `${router.location} · ${router.lastSourceIp}` : router.location}</span></td>
                  <td><span className={`router-monitoring-status ${router.status}`}>{router.status === 'not_configured' ? 'Setup needed' : router.status === 'online' ? 'Online' : 'Offline'}</span></td>
                  <td>
                    {router.activeHotspotUsers === null || router.activePppoeUsers === null
                      ? <span className="router-unknown-value">Not reported</span>
                      : <><strong>{router.activeHotspotUsers + router.activePppoeUsers}</strong><small className="router-session-breakdown">Hotspot {router.activeHotspotUsers} · PPPoE {router.activePppoeUsers}</small></>}
                  </td>
                  <td>{router.winboxEnabled === false
                    ? <span className="router-unknown-value">Disabled</span>
                    : router.winboxEnabled && router.winboxPort
                      ? <code>:{router.winboxPort}</code>
                      : <span className="router-unknown-value">Not reported</span>}</td>
                  <td>{webConsoleUrl
                    ? <a className="router-web-console" href={webConsoleUrl} target="_blank" rel="noopener noreferrer">Open <ArrowRight size={11} /></a>
                    : router.webEnabled === false
                      ? <span className="router-unknown-value">Disabled</span>
                      : <span className="router-unknown-value">Not reported</span>}</td>
                  <td>{router.lastSeenAt
                    ? <time dateTime={router.lastSeenAt} title={router.metricsUpdatedAt ? `Metrics sampled ${new Date(router.metricsUpdatedAt).toLocaleString()}` : 'Heartbeat received'}>{new Date(router.lastSeenAt).toLocaleString()}</time>
                    : <span className="router-unknown-value">Never reported</span>}</td>
                  <td>
                    <details className="router-row-menu">
                      <summary aria-label={`Actions for ${router.routerName}`}><MoreHorizontal size={17} /></summary>
                      <div className="router-row-menu-items" role="menu">
                        <button type="button" role="menuitem" onClick={() => { setRouterDetailTab('System'); setSelectedRouterId(router.id) }}>View router</button>
                        <button type="button" role="menuitem" disabled={!router.monitored} onClick={() => { setRouterDetailTab('Diagnosis'); setSelectedRouterId(router.id) }}>Diagnose</button>
                        {webConsoleUrl
                          ? <a role="menuitem" href={webConsoleUrl} target="_blank" rel="noopener noreferrer">Open web console</a>
                          : <button type="button" role="menuitem" disabled>Open web console · not reported</button>}
                        <button type="button" role="menuitem" disabled={scriptBusy} onClick={() => void generateMonitorScript(router)}>{router.monitored ? 'Regenerate monitor script' : 'Set up monitoring'}</button>
                        <button type="button" role="menuitem" onClick={() => beginReprovision(router)}>Reprovision router</button>
                        <button type="button" role="menuitem" className="router-menu-delete" onClick={() => void confirmRemoveRouter(router)}>Delete router…</button>
                      </div>
                    </details>
                  </td>
                </tr>
                )
              })}
              {!loading && filteredRouters.length === 0 && <tr><td colSpan={7}>{routers.length ? 'No routers match your search.' : 'No network sites are registered. Link a MikroTik router to get started.'}</td></tr>}
              {loading && <tr><td colSpan={7}>Loading router monitors…</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="router-table-footer">Session counts, service ports, and last-online times come from RouterOS monitoring reports. New service-port fields appear after the router receives the refreshed monitor script and checks in.</div>
      </div>
      <div className="router-management-footer"><button type="button" className="router-refresh-button" onClick={() => void load()} disabled={refreshing}><RefreshCw size={13} className={refreshing ? 'is-spinning' : undefined} />{refreshing ? 'Refreshing…' : 'Refresh routers'}</button></div>
    </section>
  )
}

function PortalTemplatePanel() {
  const [activeTemplate, setActiveTemplate] = useState<HotspotPortalTemplateId>('original')
  const [selectedTemplate, setSelectedTemplate] = useState<HotspotPortalTemplateId>('original')
  const [branding, setBranding] = useState<{ companyName: string; welcomeHeadline: string; welcomeMessage: string; supportMessage: string }>({ ...defaultHotspotPortalBranding })
  const [savedBranding, setSavedBranding] = useState<{ companyName: string; welcomeHeadline: string; welcomeMessage: string; supportMessage: string }>({ ...defaultHotspotPortalBranding })
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/hotspot/portal-template', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as {
          activeTemplate?: unknown
          companyName?: unknown
          welcomeHeadline?: unknown
          welcomeMessage?: unknown
          supportMessage?: unknown
          error?: string
        }
        if (!response.ok) throw new Error(result.error || 'Could not load portal design.')
        if (!isHotspotPortalTemplateId(result.activeTemplate)) throw new Error('The saved portal design is unavailable.')
        if (!cancelled) {
          setActiveTemplate(result.activeTemplate)
          setSelectedTemplate(result.activeTemplate)
          const loadedBranding = {
            companyName: typeof result.companyName === 'string' ? result.companyName : defaultHotspotPortalBranding.companyName,
            welcomeHeadline: typeof result.welcomeHeadline === 'string' ? result.welcomeHeadline : defaultHotspotPortalBranding.welcomeHeadline,
            welcomeMessage: typeof result.welcomeMessage === 'string' ? result.welcomeMessage : defaultHotspotPortalBranding.welcomeMessage,
            supportMessage: typeof result.supportMessage === 'string' ? result.supportMessage : defaultHotspotPortalBranding.supportMessage,
          }
          setBranding(loadedBranding)
          setSavedBranding(loadedBranding)
          setLoadFailed(false)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadFailed(true)
          setMessage(error instanceof Error ? error.message : 'Could not load portal design.')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const applyTemplate = async () => {
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/api/hotspot/portal-template', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ template: selectedTemplate, ...branding }),
      })
      const result = await response.json() as {
        activeTemplate?: unknown
        companyName?: unknown
        welcomeHeadline?: unknown
        welcomeMessage?: unknown
        supportMessage?: unknown
        error?: string
      }
      if (!response.ok || !isHotspotPortalTemplateId(result.activeTemplate) ||
        typeof result.companyName !== 'string' || typeof result.welcomeHeadline !== 'string' ||
        typeof result.welcomeMessage !== 'string' || typeof result.supportMessage !== 'string') {
        throw new Error(result.error || 'Could not apply portal design and branding.')
      }
      setActiveTemplate(result.activeTemplate)
      setSelectedTemplate(result.activeTemplate)
      const appliedBranding = {
        companyName: result.companyName,
        welcomeHeadline: result.welcomeHeadline,
        welcomeMessage: result.welcomeMessage,
        supportMessage: result.supportMessage,
      }
      setBranding(appliedBranding)
      setSavedBranding(appliedBranding)
      setMessage('Portal design and branding applied. Customers will see them the next time they open the hotspot page.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not apply portal design.')
    } finally {
      setSaving(false)
    }
  }

  const activeName = hotspotPortalTemplates.find((template) => template.id === activeTemplate)?.name || 'LKTech Original'
  const brandingChanged = Object.keys(branding).some((key) => branding[key as keyof typeof branding] !== savedBranding[key as keyof typeof savedBranding])

  return <section className="portal-template-workspace">
    <div className="portal-template-heading"><div><div className="provisioning-breadcrumb"><span>NETWORK</span><span className="breadcrumb-rule" /><span>CAPTIVE PORTAL</span></div><h1>Portal <span>design.</span></h1><p>Choose how the hotspot login appears to customers.</p></div><div className="portal-template-live"><span>LIVE DESIGN</span><strong>{activeName}</strong></div></div>
    {message && <p className={`router-discovery-status${/^(Unable|Could not|The saved|companyName|welcomeHeadline|welcomeMessage|supportMessage)/i.test(message) ? ' error' : ''}`} role="status">{message}</p>}
    <div className="portal-template-grid" aria-label="Captive portal templates">
      {hotspotPortalTemplates.map((template) => <button type="button" key={template.id} className={`portal-template-card${selectedTemplate === template.id ? ' selected' : ''}`} aria-pressed={selectedTemplate === template.id} onClick={() => setSelectedTemplate(template.id)} disabled={loading || loadFailed || saving}>
        <div className={`portal-template-preview preview-${template.id}`} style={{ '--preview-background': template.background, '--preview-surface': template.surface, '--preview-accent': template.accent, '--preview-text': template.previewText } as React.CSSProperties} aria-hidden="true">
          <div className="portal-preview-cables"><i className="preview-cable cable-path-a" /><i className="preview-cable cable-path-b" /><i className="preview-cable cable-path-c" /><i className="preview-cable-node cable-node-a" /><i className="preview-cable-node cable-node-b" /><i className="preview-cable-node cable-node-c" /></div>
          <div className="portal-preview-header"><span className="portal-preview-mark">L</span><span className="portal-preview-signal" /></div>
          <div className="portal-preview-copy"><span>{branding.companyName} HOTSPOT</span><strong>{branding.welcomeHeadline}</strong></div>
          <div className="portal-preview-offer"><span>Daily 1 hour</span><strong>KSh 20</strong></div>
          <div className="portal-preview-action">Connect to Wi-Fi <span aria-hidden="true">&#8594;</span></div>
        </div>
        <div className="portal-template-card-copy"><span><strong>{template.name}</strong><small>{template.description}</small></span>{activeTemplate === template.id && <b>LIVE</b>}</div>
      </button>)}
    </div>
    <section className="portal-branding-section" aria-labelledby="portal-branding-title">
      <div className="portal-branding-heading"><div><h2 id="portal-branding-title">Company branding</h2><p>Customize the name and welcome shown across all hotspot locations.</p></div><span>NETWORK-WIDE</span></div>
      <div className="portal-branding-grid">
        <label>Company name<input value={branding.companyName} maxLength={48} disabled={loading || loadFailed || saving} onChange={(event) => setBranding((current) => ({ ...current, companyName: event.target.value }))} placeholder="e.g. LKTech Marine" /></label>
        <label>Welcome headline<input value={branding.welcomeHeadline} maxLength={80} disabled={loading || loadFailed || saving} onChange={(event) => setBranding((current) => ({ ...current, welcomeHeadline: event.target.value }))} placeholder="Connect to what matters." /></label>
        <label className="portal-branding-wide">Welcome message<textarea value={branding.welcomeMessage} maxLength={180} rows={3} disabled={loading || loadFailed || saving} onChange={(event) => setBranding((current) => ({ ...current, welcomeMessage: event.target.value }))} placeholder="A short welcome for your customers." /></label>
        <label className="portal-branding-wide">Support line<input value={branding.supportMessage} maxLength={120} disabled={loading || loadFailed || saving} onChange={(event) => setBranding((current) => ({ ...current, supportMessage: event.target.value }))} placeholder="Need help? Contact your network operator." /></label>
      </div>
    </section>
    <div className="portal-template-actions"><span>Currently active: <strong>{activeName}</strong> · <strong>{savedBranding.companyName}</strong></span><button className="primary-button" type="button" onClick={() => void applyTemplate()} disabled={loading || loadFailed || saving || (selectedTemplate === activeTemplate && !brandingChanged)}>{saving ? 'Applying...' : brandingChanged ? 'Save & apply' : 'Apply design'}</button></div>
  </section>
}

function ModulePanel({ title }: { title: string }) {
  return (
    <section className="module-workspace">
      <div className="page-heading">
        <div><div className="live-label"><StatusDot tone="amber" /> MODULE SETUP</div><h1>{title}</h1><p>Manage {title.toLowerCase()} for your network.</p></div>
      </div>
      <section className="module-state panel">
        <div className="module-state-icon"><Settings2 size={20} /></div>
        <div><span>WORKSPACE STATUS</span><h2>{title} is ready to configure</h2><p>This section does not have a live data source connected yet. Connect its records to manage them here.</p></div>
      </section>
    </section>
  )
}

type PlanRow = {
  id: string
  name: string
  type: string
  availability: 'live' | 'hidden' | 'off'
  listed: boolean
  active?: boolean
  subscribersCount?: number
  monthlyPrice: number
  durationSeconds: number
  rateLimit: string
  devicesPerAccount: number
  burstLimit: string | null
  burstThreshold: string | null
  burstTimeSeconds: number | null
  fupEnabled: boolean
  fupLimitBytes: number | null
  fupUploadRate: string | null
  fupDownloadRate: string | null
  scheduleEnabled: boolean
  scheduleSpec: string | null
  nasRestrictions: string[]
}

const planTypes = ['Hotspot', 'PPPoE', 'Bundle', 'Trial', 'TV'] as const
const planDurations = [
  { label: '30 minutes', seconds: 1800 },
  { label: '1 hour', seconds: 3600 },
  { label: '4 hours', seconds: 14400 },
  { label: '6 hours', seconds: 21600 },
  { label: '12 hours', seconds: 43200 },
  { label: '1 day', seconds: 86400 },
  { label: '7 days', seconds: 604800 },
  { label: '30 days', seconds: 2592000 },
  { label: '365 days', seconds: 31536000 },
]

function PackagePanel({ initialFilter = '' }: { initialFilter?: string }) {
  const [rows, setRows] = useState<PlanRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [updatingPlanId, setUpdatingPlanId] = useState('')
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('All')
  const [query, setQuery] = useState(initialFilter)
  const [name, setName] = useState('')
  const [type, setType] = useState<(typeof planTypes)[number]>('Hotspot')
  const [availability, setAvailability] = useState<'live' | 'hidden' | 'off'>('live')
  const [price, setPrice] = useState('')
  const [durationSeconds, setDurationSeconds] = useState('2592000')
  const [rateLimit, setRateLimit] = useState('5M/5M')
  const [devicesPerAccount, setDevicesPerAccount] = useState('1')
  const [burstLimit, setBurstLimit] = useState('')
  const [burstThreshold, setBurstThreshold] = useState('')
  const [burstTimeSeconds, setBurstTimeSeconds] = useState('')
  const [fupEnabled, setFupEnabled] = useState(false)
  const [fupLimitGb, setFupLimitGb] = useState('')
  const [fupUploadRate, setFupUploadRate] = useState('')
  const [fupDownloadRate, setFupDownloadRate] = useState('')
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleSpec, setScheduleSpec] = useState('')
  const [nasRestrictions, setNasRestrictions] = useState('')

  const load = async () => {
    const response = await fetch('/api/packages', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok || !Array.isArray(result)) throw new Error('Could not load packages.')
    setRows(result as PlanRow[])
  }

  useEffect(() => { void load().catch(() => setMessage('Could not load packages.')) }, [])
  useEffect(() => { setQuery(initialFilter) }, [initialFilter])

  const visibleRows = rows.filter((row) => {
    const matchesCategory = filter === 'All' || (filter === 'Hotspot' ? row.type === 'Hotspot' : filter === 'PPPoE' ? row.type === 'PPPoE' : ['Bundle', 'Trial', 'TV'].includes(row.type))
    const matchesQuery = `${row.name} ${row.type} ${row.rateLimit}`.toLowerCase().includes(query.toLowerCase())
    return matchesCategory && matchesQuery
  })
  const liveCount = rows.filter((row) => row.availability === 'live' && row.active !== false).length
  const hiddenCount = rows.filter((row) => row.availability === 'hidden').length
  const unlistedCount = rows.filter((row) => !row.listed).length

  const resetForm = () => {
    setName('')
    setType('Hotspot')
    setAvailability('live')
    setPrice('')
    setDurationSeconds('2592000')
    setRateLimit('5M/5M')
    setDevicesPerAccount('1')
    setBurstLimit('')
    setBurstThreshold('')
    setBurstTimeSeconds('')
    setFupEnabled(false)
    setFupLimitGb('')
    setFupUploadRate('')
    setFupDownloadRate('')
    setScheduleEnabled(false)
    setScheduleSpec('')
    setNasRestrictions('')
  }

  const createPlan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    const [uploadRate, downloadRate] = rateLimit.split('/')
    const restrictions = nasRestrictions.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean)
    const body = {
      name,
      type,
      availability,
      monthlyPrice: Number(price),
      durationSeconds: Number(durationSeconds),
      rateLimit,
      uploadMbps: Number.parseFloat(uploadRate),
      downloadMbps: Number.parseFloat(downloadRate),
      devicesPerAccount: Number(devicesPerAccount),
      burstLimit: burstLimit || null,
      burstThreshold: burstThreshold || null,
      burstTimeSeconds: burstTimeSeconds ? Number(burstTimeSeconds) : null,
      fupEnabled,
      fupLimitBytes: fupEnabled ? Math.round(Number(fupLimitGb) * 1024 ** 3) : null,
      fupUploadRate: fupEnabled ? fupUploadRate : null,
      fupDownloadRate: fupEnabled ? fupDownloadRate : null,
      scheduleEnabled,
      scheduleSpec: scheduleEnabled ? scheduleSpec : null,
      nasRestrictions: restrictions,
    }
    try {
      const response = await fetch('/api/packages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not create package.')
      resetForm()
      setShowForm(false)
      setMessage('Package created.')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create package.')
    } finally {
      setSaving(false)
    }
  }

  const removePlan = async (id: string) => {
    try {
      const response = await fetch(`/api/packages?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not remove package.')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove package.')
    }
  }

  const updateAvailability = async (id: string, nextAvailability: PlanRow['availability']) => {
    setUpdatingPlanId(id)
    setMessage('')
    try {
      const response = await fetch(`/api/packages?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ availability: nextAvailability }),
      })
      const result = await response.json() as { availability?: PlanRow['availability']; error?: string }
      if (!response.ok || !result.availability) throw new Error(result.error || 'Could not update package availability.')
      setRows((currentRows) => currentRows.map((row) => row.id === id ? {
        ...row,
        availability: result.availability!,
        active: result.availability !== 'off',
        listed: result.availability === 'live',
      } : row))
      setMessage(`${nextAvailability === 'live' ? 'Enabled' : nextAvailability === 'off' ? 'Disabled' : 'Hidden'} package.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update package availability.')
    } finally {
      setUpdatingPlanId('')
    }
  }

  const tabs = [
    { label: 'All', count: rows.length },
    { label: 'Hotspot', count: rows.filter((row) => row.type === 'Hotspot').length },
    { label: 'PPPoE', count: rows.filter((row) => row.type === 'PPPoE').length },
    { label: 'Bundles', count: rows.filter((row) => ['Bundle', 'Trial', 'TV'].includes(row.type)).length },
  ]

  return <section className="package-workspace">
    <div className="package-page-heading"><div><div className="provisioning-breadcrumb"><span>NETWORK</span><span className="breadcrumb-rule" /><span>PLANS</span></div><h1>Your <span>packages.</span></h1><p>Every plan you offer, grouped by connection type. {liveCount} active across the network.</p></div><button className="primary-button" onClick={() => { setShowForm((open) => !open); setMessage('') }}>{showForm ? 'Close form' : '+ New package'}</button></div>
    {message && <p className={`router-discovery-status${message.includes('could not') || message.includes('Could not') ? ' error' : ''}`} role="status">{message}</p>}
    <div className="package-stats"><div><span>ALL PLANS</span><strong>{rows.length}</strong><small>{unlistedCount} unlisted</small></div><div><span>ACTIVE</span><strong>{liveCount}</strong><small>currently offering</small></div><div><span>UNLISTED</span><strong>{unlistedCount}</strong><small>not listed publicly</small></div><div><span>HIDDEN</span><strong>{hiddenCount}</strong><small>not open for sign-up</small></div><div><span>SUBSCRIBERS</span><strong>{rows.reduce((sum, row) => sum + (Number(row.subscribersCount) || 0), 0)}</strong><small>assigned to plans</small></div></div>
    {showForm && <form className="plan-editor" onSubmit={createPlan}>
      <div className="plan-editor-heading"><div><div className="section-eyebrow">PACKAGES <span>—</span> NEW</div><h2>Create a <span>package.</span></h2><p>Speed limits, scheduling, and NAS restrictions.</p></div></div>
      <section className="plan-form-section"><h3>Identity</h3><div className="plan-form-card"><div className="plan-form-grid"><label>Name *<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Home 10 Mbps" maxLength={80} required /></label><label>Type *<select value={type} onChange={(event) => setType(event.target.value as (typeof planTypes)[number])}>{planTypes.map((option) => <option key={option}>{option}</option>)}</select></label></div><fieldset className="availability-fieldset"><legend>Availability</legend><div className="availability-control">{(['live', 'hidden', 'off'] as const).map((state) => <button type="button" key={state} className={availability === state ? `selected availability-${state}` : ''} aria-pressed={availability === state} onClick={() => setAvailability(state)}>{state === 'live' ? 'Live' : state === 'hidden' ? 'Hidden' : 'Off'}</button>)}</div><small>{availability === 'live' ? 'Visible to customers and accepting signups.' : availability === 'hidden' ? 'Kept for existing subscribers, but hidden from signup.' : 'Disabled and unavailable for new subscribers.'}</small></fieldset></div></section>
      <section className="plan-form-section"><h3>Pricing</h3><div className="plan-form-card"><div className="plan-form-grid"><label>Price *<span className="price-input"><span>KSh</span><input inputMode="numeric" type="number" min="0" step="1" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" required /></span><small>Set KSh 0 for a free offer. Free plans connect directly without M-Pesa.</small></label><label>Duration *<select value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)}>{planDurations.map((duration) => <option key={duration.seconds} value={duration.seconds}>{duration.label}</option>)}</select></label></div></div></section>
      <section className="plan-form-section"><h3>Speed</h3><div className="plan-form-card"><div className="plan-form-grid"><label>Rate-limit *<input value={rateLimit} onChange={(event) => setRateLimit(event.target.value)} placeholder="5M/5M" pattern="(?:[0-9]+(?:\\.[0-9]+)?[KMGkmg]?)/(?:[0-9]+(?:\\.[0-9]+)?[KMGkmg]?)" required/><small>Upload first, then download. Example: 2M/10M is 2M up and 10M down.</small></label><label>Devices per account<input type="number" min="1" max="64" value={devicesPerAccount} onChange={(event) => setDevicesPerAccount(event.target.value)} required /></label></div></div></section>
      <section className="plan-form-section"><div className="plan-section-heading"><h3>Burst <span>optional</span></h3><p>MikroTik burst lets a subscriber briefly exceed their rate-limit. Fill all three to enable, or leave blank to disable.</p></div><div className="plan-form-card"><div className="plan-form-grid burst-grid"><label>Burst limit<input value={burstLimit} onChange={(event) => setBurstLimit(event.target.value)} placeholder="10M/10M" pattern="(?:[0-9]+(?:\\.[0-9]+)?[KMGkmg]?)/(?:[0-9]+(?:\\.[0-9]+)?[KMGkmg]?)" /></label><label>Burst threshold<input value={burstThreshold} onChange={(event) => setBurstThreshold(event.target.value)} placeholder="5M/5M" pattern="(?:[0-9]+(?:\\.[0-9]+)?[KMGkmg]?)/(?:[0-9]+(?:\\.[0-9]+)?[KMGkmg]?)" /></label><label>Burst time<input type="number" min="1" max="3600" value={burstTimeSeconds} onChange={(event) => setBurstTimeSeconds(event.target.value)} placeholder="30"/><small>seconds</small></label></div></div></section>
      <section className="plan-form-section"><h3>Fair Use Policy</h3><div className="plan-form-card"><label className="plan-toggle-row"><span><strong>Enforce FUP</strong><small>Throttle the upload and download rates after this purchase exceeds its data limit. The new rates apply on the next login or reconnect.</small></span><input type="checkbox" checked={fupEnabled} onChange={(event) => setFupEnabled(event.target.checked)} /><span>{fupEnabled ? 'On' : 'Off'}</span></label>{fupEnabled && <><label className="plan-extra-field">Limit per purchase (GB)<input type="number" min="0.1" step="0.1" value={fupLimitGb} onChange={(event) => setFupLimitGb(event.target.value)} placeholder="e.g. 100" required /></label><div className="plan-form-grid"><label>Throttle upload *<input value={fupUploadRate} onChange={(event) => setFupUploadRate(event.target.value)} placeholder="e.g. 1M" pattern="[0-9]+(?:\\.[0-9]+)?[KMGkmg]?" required /><small>Applied as the MikroTik upload rate.</small></label><label>Throttle download *<input value={fupDownloadRate} onChange={(event) => setFupDownloadRate(event.target.value)} placeholder="e.g. 2M" pattern="[0-9]+(?:\\.[0-9]+)?[KMGkmg]?" required /><small>Applied as the MikroTik download rate.</small></label></div><p className="plan-section-heading">Enforcement: <strong>Throttle</strong> · Usage resets with each purchase</p></>}</div></section>
      <section className="plan-form-section"><h3>Schedule</h3><div className="plan-form-card"><label className="plan-toggle-row"><span><strong>Restrict to a schedule</strong><small>Limit when this plan is usable — for example, weekdays 8am–6pm.</small></span><input type="checkbox" checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} /><span>{scheduleEnabled ? 'On' : 'Off'}</span></label>{scheduleEnabled && <label className="plan-extra-field">RADIUS Login-Time<input value={scheduleSpec} onChange={(event) => setScheduleSpec(event.target.value)} placeholder="Mo-Fr0800-1800" required /><small>Example: Mo-Fr0800-1800. Use RADIUS Login-Time syntax.</small></label>}</div></section>
      <section className="plan-form-section"><div className="plan-section-heading"><h3>NAS restriction <span>optional</span></h3><p>Limit this plan to specific routers. Leave empty to allow on every NAS.</p></div><div className="plan-form-card"><label className="plan-extra-field">Allowed NAS IPv4 addresses<input value={nasRestrictions} onChange={(event) => setNasRestrictions(event.target.value)} placeholder="10.10.159.198, 10.10.53.29"/><small>Separate router addresses with commas.</small></label></div></section>
      <div className="plan-editor-footer"><span>All policy values are copied into newly issued subscriber accounts.</span><button className="wizard-next" type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create package'}</button></div>
    </form>}
    <div className="plan-toolbar"><div className="plan-tabs">{tabs.map((tab) => <button type="button" key={tab.label} className={filter === tab.label ? 'selected' : ''} onClick={() => setFilter(tab.label)}>{tab.label}<span>{tab.count}</span></button>)}</div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by name, speed, duration..." aria-label="Filter plans" /></div>
    <div className="panel plan-table-wrap"><div className="table-scroll"><table className="plan-table"><thead><tr><th>PLAN</th><th>TYPE</th><th>PRICE</th><th>DURATION</th><th>RATE-LIMIT</th><th>DEVICES</th><th>STATUS</th><th /></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.rateLimit} · {planDurations.find((duration) => duration.seconds === row.durationSeconds)?.label || `${Math.ceil(row.durationSeconds / 86400)}d`}</small></td><td><span className={`plan-type plan-type-${row.type.toLowerCase()}`}>{row.type}</span></td><td className="plan-price">KSh {Number(row.monthlyPrice).toLocaleString('en-KE')}</td><td>{planDurations.find((duration) => duration.seconds === row.durationSeconds)?.label || `${Math.ceil(row.durationSeconds / 86400)} days`}</td><td className="mono">{row.rateLimit}</td><td>{row.devicesPerAccount}</td><td><select className={`plan-availability plan-status-${row.availability}`} aria-label={`${row.name} availability`} value={row.availability} disabled={updatingPlanId === row.id} onChange={(event) => void updateAvailability(row.id, event.target.value as PlanRow['availability'])}><option value="live">Live</option><option value="hidden">Hidden</option><option value="off">Off</option></select></td><td><button type="button" className="text-button danger-text" aria-label={`Delete ${row.name}`} onClick={() => void removePlan(row.id)}>Remove</button></td></tr>)}{visibleRows.length === 0 && <tr><td colSpan={8} className="plan-empty">{rows.length === 0 ? 'No plans yet. Create your first package above.' : 'No packages match this filter.'}</td></tr>}</tbody></table></div></div>
  </section>
}

function CrudPanel({ entity, initialFilter = '' }: { entity: 'sites' | 'customers' | 'packages' | 'payments'; initialFilter?: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [subscriberPlans, setSubscriberPlans] = useState<{ id: string; name: string; type: string; monthlyPrice: number; durationSeconds: number; availability: string }[]>([])
  const [subscriberPlansError, setSubscriberPlansError] = useState('')
  const [recordFilter, setRecordFilter] = useState(initialFilter)
  const [name, setName] = useState('')
  const [detail, setDetail] = useState('')
  const [subscriberPhone, setSubscriberPhone] = useState('')
  const [subscriberPlanId, setSubscriberPlanId] = useState('')
  const [radiusUsername, setRadiusUsername] = useState('')
  const [radiusPassword, setRadiusPassword] = useState('')
  const [confirmRadiusPassword, setConfirmRadiusPassword] = useState('')
  const [showRadiusPassword, setShowRadiusPassword] = useState(false)
  const [subscriberFormOpen, setSubscriberFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)
  const [editingExpiryId, setEditingExpiryId] = useState('')
  const [expiryInput, setExpiryInput] = useState('')
  const [detailsLoadingId, setDetailsLoadingId] = useState('')
  const [expandedDetailsId, setExpandedDetailsId] = useState('')
  const [subscriberDetails, setSubscriberDetails] = useState<SubscriberProfileData | null>(null)
  const [detailsError, setDetailsError] = useState('')
  const [showSubscriberPassword, setShowSubscriberPassword] = useState(false)
  const [copiedCredential, setCopiedCredential] = useState('')
  const labels = { sites: 'Routers', customers: 'Subscribers', packages: 'Plans', payments: 'Payments' }
  const toggleSubscriberForm = () => {
    if (subscriberFormOpen) {
      setRadiusPassword('')
      setConfirmRadiusPassword('')
      setShowRadiusPassword(false)
      setMessage('')
      setMessageIsError(false)
    }
    setSubscriberFormOpen(!subscriberFormOpen)
  }
  const toggleSubscriberDetails = async (customerId: string) => {
    if (expandedDetailsId === customerId) {
      setExpandedDetailsId('')
      setSubscriberDetails(null)
      setDetailsError('')
      setShowSubscriberPassword(false)
      return
    }
    setExpandedDetailsId(customerId)
    setDetailsLoadingId(customerId)
    setDetailsError('')
    setSubscriberDetails(null)
    setShowSubscriberPassword(false)
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(customerId)}/details`, { cache: 'no-store' })
      const result = await response.json() as SubscriberProfileData & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to load subscriber details.')
      setSubscriberDetails(result)
    } catch (reason) {
      setDetailsError(reason instanceof Error ? reason.message : 'Unable to load subscriber details.')
    } finally {
      setDetailsLoadingId('')
    }
  }
  const copySubscriberCredential = async (kind: 'username' | 'password' | 'accountNumber', value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedCredential(kind)
      window.setTimeout(() => setCopiedCredential(''), 1800)
    } catch {
      setDetailsError(`Could not copy the ${kind === 'accountNumber' ? 'account number' : kind}. Please select and copy it manually.`)
    }
  }

  useEffect(() => {
    if (entity !== 'customers') return
    let active = true
    const loadSubscriberPlans = async () => {
      try {
        const response = await fetch('/api/packages', { cache: 'no-store' })
        const result = await response.json() as { error?: string } | Record<string, unknown>[]
        if (!response.ok || !Array.isArray(result)) throw new Error(!Array.isArray(result) && result.error ? result.error : 'Unable to load service plans.')
        const plans = result.filter((plan): plan is Record<string, unknown> => typeof plan === 'object' && plan !== null)
          .filter((plan) => plan.active === true && plan.availability !== 'off')
          .map((plan) => ({
            id: String(plan.id),
            name: String(plan.name),
            type: String(plan.type || 'Hotspot'),
            monthlyPrice: Number(plan.monthlyPrice) || 0,
            durationSeconds: Number(plan.durationSeconds) || 0,
            availability: String(plan.availability || 'live'),
          }))
        if (active) {
          setSubscriberPlans(plans)
          setSubscriberPlansError(plans.length ? '' : 'Create an enabled plan before adding a subscriber.')
        }
      } catch (error) {
        if (active) {
          setSubscriberPlans([])
          setSubscriberPlansError(error instanceof Error ? error.message : 'Unable to load service plans.')
        }
      }
    }
    void loadSubscriberPlans()
    return () => { active = false }
  }, [entity])

  const load = () => fetch(`/api/${entity}`, { cache: 'no-store' }).then(async (response) => {
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not load live records')
    setRows(Array.isArray(data) ? data : [])
  })
  useEffect(() => { load().catch(() => setMessage('Could not load live records')) }, [entity])
  useEffect(() => { setRecordFilter(initialFilter) }, [initialFilter])
  const filteredRows = useMemo(() => {
    const normalizedFilter = recordFilter.trim().toLowerCase()
    if (!normalizedFilter) return rows
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(normalizedFilter)))
  }, [recordFilter, rows])
  const create = async () => {
    if (!name.trim()) { setMessageIsError(true); return setMessage('Enter the subscriber name.') }
    if (entity === 'customers' && (!radiusUsername.trim() || !radiusPassword)) { setMessageIsError(true); return setMessage('Enter a RADIUS username and password.') }
    if (entity === 'customers' && !subscriberPlanId) { setMessageIsError(true); return setMessage('Choose a service plan.') }
    const selectedSubscriberPlan = subscriberPlans.find((plan) => plan.id === subscriberPlanId)
    if (entity === 'customers' && selectedSubscriberPlan?.type === 'PPPoE' && !subscriberPhone.trim()) { setMessageIsError(true); return setMessage('Enter a phone number for the PPPoE account.') }
    if (entity === 'customers' && radiusPassword.trim().length < 12) { setMessageIsError(true); return setMessage('RADIUS password must be at least 12 characters.') }
    if (entity === 'customers' && radiusPassword !== confirmRadiusPassword) { setMessageIsError(true); return setMessage('The RADIUS passwords do not match.') }
    setSaving(true)
    setMessage('')
    setMessageIsError(false)
    const body = entity === 'sites'
      ? { name, location: detail || 'Central Sector' }
      : entity === 'customers'
        ? { name: name.trim(), email: detail.trim(), phone: subscriberPhone.trim(), packageId: subscriberPlanId, radiusUsername: radiusUsername.trim(), password: radiusPassword }
        : entity === 'packages'
          ? { name, downloadMbps: 20, uploadMbps: 10, monthlyPrice: 1800 }
          : { amount: 1800, method: detail || 'Mobile Money', reference: `PAY-${Date.now()}` }
    try {
      const response = await fetch(`/api/${entity}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (!response.ok) {
        const result = await response.json() as { error?: string }
        setMessageIsError(true)
        return setMessage(result.error || 'Unable to save record')
      }
      setName(''); setDetail(''); setSubscriberPhone(''); setSubscriberPlanId(''); setRadiusUsername(''); setRadiusPassword(''); setConfirmRadiusPassword('')
      setShowRadiusPassword(false)
      if (entity === 'customers') setSubscriberFormOpen(false)
      setMessage(entity === 'customers' ? 'Subscriber created safely suspended with the selected plan. Activate the account and set its expiry before service begins; use View details to retrieve the login and any PPPoE account number.' : 'Record created')
      try {
        await load()
      } catch (reason) {
        setMessageIsError(false)
        setMessage(`${entity === 'customers' ? 'Subscriber created' : 'Record created'}, but the list could not refresh: ${reason instanceof Error ? reason.message : 'please refresh and try again.'}`)
      }
    } catch (reason) {
      setMessageIsError(true)
      setMessage(reason instanceof Error ? reason.message : 'Unable to save record')
    } finally {
      setSaving(false)
    }
  }
  const remove = async (id: string) => {
    setSaving(true)
    setMessage('')
    setMessageIsError(false)
    try {
      const response = await fetch(`/api/${entity}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to delete record.')
      await load()
      if (entity === 'sites') window.dispatchEvent(new Event('workspace-data-changed'))
      setMessage('Record deleted.')
    } catch (reason) {
      setMessageIsError(true)
      setMessage(reason instanceof Error ? reason.message : 'Unable to delete record.')
    } finally {
      setSaving(false)
    }
  }
  const changeSubscriberStatus = async (row: Record<string, unknown>, nextStatus: 'active' | 'suspended') => {
    const id = String(row.id)
    let expiresAt = typeof row.expiresAt === 'string' ? row.expiresAt : ''
    if (nextStatus === 'active') {
      if (editingExpiryId !== id) {
        const existingDate = expiresAt ? new Date(expiresAt) : null
        const candidate = existingDate && existingDate.getTime() > Date.now() ? existingDate : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        setExpiryInput(new Date(candidate.getTime() - candidate.getTimezoneOffset() * 60_000).toISOString().slice(0, 16))
        setEditingExpiryId(id)
        return
      }
      if (!expiryInput) return setMessage('Choose an account expiry date and time.')
      expiresAt = new Date(expiryInput).toISOString()
    }
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, ...(nextStatus === 'active' ? { expiresAt } : {}) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to update subscriber status.')
      setMessage(nextStatus === 'active' ? 'Subscriber activated and RADIUS expiry updated.' : 'Subscriber suspended in the billing system and RADIUS.')
      setEditingExpiryId('')
      await load()
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Unable to update subscriber status.')
    } finally {
      setSaving(false)
    }
  }
  const selectedSubscriberPlan = subscriberPlans.find((plan) => plan.id === subscriberPlanId)
  return <section className={`crud-workspace${entity === 'customers' ? ' subscriber-workspace' : ''}`}><div className="page-heading"><div><div className="live-label"><StatusDot /> LIVE DATA</div><h1>{labels[entity]}</h1><p>{entity === 'customers' ? 'Manage customer contact details, PPPoE and Wi-Fi logins, service plans, and account access.' : 'Manage records persisted in Supabase.'}</p></div><button className="primary-button" type="button" onClick={() => entity === 'customers' ? toggleSubscriberForm() : void create()} disabled={saving}>{saving ? 'Saving...' : entity === 'customers' ? subscriberFormOpen ? 'Close form' : 'Add subscriber' : 'Add record'}</button></div>
    {entity === 'customers' && <div className="subscriber-info-card"><span className="subscriber-info-icon" aria-hidden="true">i</span><p><strong>Account access</strong> New subscribers start suspended for safety. Set an expiry date and choose <strong>Confirm activation</strong> before they can connect. You can suspend or renew accounts at any time.</p></div>}
    {entity === 'customers' ? (subscriberFormOpen ? <form className="subscriber-create-form panel" onSubmit={(event) => { event.preventDefault(); void create() }}>
      <div className="subscriber-form-heading"><div><span className="eyebrow">NEW SUBSCRIBER</span><h2>Create subscriber account</h2><p>Add the customer details and a unique login for your FreeRADIUS server.</p></div></div>
      <div className="subscriber-form-grid">
        <label>Full name <span aria-hidden="true">*</span><input required maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ama Mensah" /></label>
        <label>Email address <span aria-hidden="true">*</span><input required type="email" maxLength={254} autoComplete="email" value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="name@example.com" /></label>
        <label>Service plan <span aria-hidden="true">*</span><select required value={subscriberPlanId} onChange={(event) => setSubscriberPlanId(event.target.value)}><option value="">Select a plan</option>{subscriberPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.type} · KSh {plan.monthlyPrice.toLocaleString('en-KE')}{plan.availability === 'hidden' ? ' · Hidden' : ''}</option>)}</select><small>{subscriberPlansError || (selectedSubscriberPlan ? `${selectedSubscriberPlan.type} plan · ${Math.ceil(selectedSubscriberPlan.durationSeconds / 86400)} day${Math.ceil(selectedSubscriberPlan.durationSeconds / 86400) === 1 ? '' : 's'}` : 'Choose the service plan this subscriber will use.')}</small></label>
        <label>Phone number{selectedSubscriberPlan?.type === 'PPPoE' && <> <span aria-hidden="true">*</span></>}<input type="tel" required={selectedSubscriberPlan?.type === 'PPPoE'} autoComplete="tel" maxLength={32} value={subscriberPhone} onChange={(event) => setSubscriberPhone(event.target.value)} placeholder="e.g. 0712 345 678" /><small>Required for PPPoE so an account number can be assigned.</small></label>
        <label>RADIUS username <span aria-hidden="true">*</span><input required minLength={3} maxLength={64} pattern="[A-Za-z0-9._@-]{3,64}" autoComplete="username" value={radiusUsername} onChange={(event) => setRadiusUsername(event.target.value)} placeholder="3–64 letters, numbers, . _ @ -" /><small>Must be unique across all workspaces on this RADIUS server.</small></label>
        <label>RADIUS password <span aria-hidden="true">*</span><div className="subscriber-password-field"><input required type={showRadiusPassword ? 'text' : 'password'} minLength={12} maxLength={128} autoComplete="new-password" value={radiusPassword} onChange={(event) => setRadiusPassword(event.target.value)} placeholder="At least 12 characters" /><button type="button" className="password-visibility-button" onClick={() => setShowRadiusPassword((visible) => !visible)} aria-label={showRadiusPassword ? 'Hide RADIUS password' : 'Show RADIUS password'}>{showRadiusPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div><small>Use 12–128 characters. The password is provisioned to RADIUS.</small></label>
        <label className="subscriber-confirm-field">Confirm RADIUS password <span aria-hidden="true">*</span><input required type={showRadiusPassword ? 'text' : 'password'} minLength={12} maxLength={128} autoComplete="new-password" value={confirmRadiusPassword} onChange={(event) => setConfirmRadiusPassword(event.target.value)} placeholder="Re-enter the password" /></label>
      </div>
      {message && <p className={`subscriber-form-message ${messageIsError ? 'is-error' : ''}`} role={messageIsError ? 'alert' : 'status'}>{message}</p>}
      <div className="subscriber-form-footer"><span><strong>*</strong> Required fields</span><button className="primary-button" type="submit" disabled={saving || subscriberPlans.length === 0}>{saving ? 'Creating subscriber…' : 'Create subscriber account'}</button></div>
    </form> : null) : <div className="crud-form"><input value={name} onChange={(event) => setName(event.target.value)} placeholder={entity === 'payments' ? 'Amount or payment label' : `${labels[entity]} name`} aria-label="Record name" /><input value={detail} onChange={(event) => setDetail(event.target.value)} placeholder={entity === 'sites' ? 'Location' : 'Method or detail'} aria-label="Record detail" /><button className="outline-button" onClick={() => void create()} disabled={saving}>Create</button>{message && <span className={`form-message${messageIsError ? ' is-error' : ''}`} role={messageIsError ? 'alert' : 'status'}>{message}</span>}</div>}
    {entity === 'customers' && !subscriberFormOpen && message && <p className={`subscriber-flash-message ${messageIsError ? 'is-error' : ''}`} role={messageIsError ? 'alert' : 'status'}>{message}</p>}
    <div className="panel crud-table"><div className="panel-heading"><div><h3>{entity === 'customers' ? 'Subscriber accounts' : 'Records'}</h3><span>{recordFilter ? `${filteredRows.length} matching · ${rows.length} total` : `${rows.length} loaded from Supabase`}</span></div><input className="record-filter" value={recordFilter} onChange={(event) => setRecordFilter(event.target.value)} placeholder={`Filter ${labels[entity].toLowerCase()}...`} aria-label={`Filter ${labels[entity].toLowerCase()}`} /><button className="text-button" onClick={() => { void load().catch((reason) => setMessage(reason instanceof Error ? reason.message : 'Unable to refresh records.')) }}>Refresh</button></div>{message && entity !== 'customers' && <p className={`form-message${messageIsError ? ' is-error' : ''}`} role={messageIsError ? 'alert' : 'status'}>{message}</p>}<div className="table-scroll"><table><thead><tr>{entity === 'customers' ? <><th>Subscriber</th><th>PPPoE / Wi-Fi login</th><th>Plan</th><th>Account status</th><th>Expires</th><th>Actions</th></> : <><th>Name / ID</th><th>Status</th><th>Details</th><th /></>}</tr></thead><tbody>{filteredRows.map((row) => {
    const expiry = typeof row.expiresAt === 'string' ? new Date(row.expiresAt) : null
    const isExpired = Boolean(expiry && expiry.getTime() <= Date.now())
    const status = entity === 'customers' && row.status === 'active' && isExpired ? 'expired' : String(row.status || (row.active ? 'active' : 'inactive'))
    if (entity === 'customers') return <Fragment key={String(row.id)}><tr>
      <td><strong>{String(row.name || 'Unnamed subscriber')}</strong><span>{String(row.email || 'No email address')}</span>{typeof row.phone === 'string' && row.phone.trim() ? <span>{row.phone}</span> : null}<small className="subscriber-created">Added {typeof row.createdAt === 'string' ? new Date(row.createdAt).toLocaleDateString() : 'date unavailable'}</small></td>
      <td><strong className="subscriber-login">{String(row.radiusUsername || 'No login')}</strong><span>RADIUS username</span></td>
      <td><strong>{String(row.plan || 'No plan assigned')}</strong>{Number(row.monthlyRate) > 0 && <span>KSh {Number(row.monthlyRate).toLocaleString('en-KE')} / month</span>}</td>
      <td><span className={`subscriber-status subscriber-status-${status.replace(/[^a-z0-9-]/g, '-')}`}>{status === 'active' ? 'Active' : status === 'suspended' ? 'Suspended' : status === 'expired' ? 'Expired' : status}</span></td>
      <td>{expiry && Number.isFinite(expiry.getTime()) ? <><strong>{expiry.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</strong><span>{expiry.toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' })}</span></> : <span className="subscriber-no-expiry">No expiry set</span>}</td>
      <td>{row.radiusUsername ? <div className="subscriber-actions"><button className="subscriber-details-toggle" type="button" aria-expanded={expandedDetailsId === String(row.id)} disabled={detailsLoadingId === String(row.id)} onClick={() => void toggleSubscriberDetails(String(row.id))}>{detailsLoadingId === String(row.id) ? 'Loading…' : expandedDetailsId === String(row.id) ? 'Hide details' : 'View details'}</button>{status === 'active' ? <button className="text-button danger-text" disabled={saving} onClick={() => void changeSubscriberStatus(row, 'suspended')}>Suspend</button> : editingExpiryId === String(row.id) ? <div className="subscriber-reactivation"><label>New expiry date and time<input type="datetime-local" aria-label={`New expiry for ${String(row.name || 'subscriber')}`} value={expiryInput} onChange={(event) => setExpiryInput(event.target.value)} /></label><button className="text-button" disabled={saving} onClick={() => void changeSubscriberStatus(row, 'active')}>{saving ? 'Saving...' : 'Confirm activation'}</button><button className="text-button danger-text" disabled={saving} onClick={() => setEditingExpiryId('')}>Cancel</button></div> : <button className="text-button" disabled={saving} onClick={() => void changeSubscriberStatus(row, 'active')}>{status === 'expired' ? 'Renew account' : 'Activate account'}</button>}<button className="text-button danger-text" disabled={saving} onClick={() => void remove(String(row.id))}>Delete</button></div> : <span>Login unavailable</span>}</td>
    </tr>{expandedDetailsId === String(row.id) && <tr className="subscriber-detail-row"><td colSpan={6}>{detailsLoadingId === String(row.id) ? <p className="subscriber-detail-loading" role="status">Loading secure subscriber details…</p> : detailsError ? <p className="subscriber-form-message is-error" role="alert">{detailsError}</p> : subscriberDetails && String(subscriberDetails.id) === String(row.id) ?
      <SubscriberProfile
        data={subscriberDetails}
        onClose={() => { setExpandedDetailsId(''); setSubscriberDetails(null); setDetailsError(''); setShowSubscriberPassword(false) }}
        onCopy={(kind, value) => void copySubscriberCredential(kind, value)}
        copiedCredential={copiedCredential}
        showPassword={showSubscriberPassword}
        onTogglePassword={() => setShowSubscriberPassword((visible) => !visible)}
      /> : null}</td></tr>}</Fragment>
    return <tr key={String(row.id)}><td><strong>{String(row.name || row.reference || row.id).slice(0, 34)}</strong></td><td><span className="table-status">{status}</span></td><td className="mono">{String(row.radiusUsername || row.location || row.email || row.monthlyPrice || row.amount || '')}</td><td><button className="text-button danger-text" disabled={saving} onClick={() => void remove(String(row.id))}>Delete</button></td></tr>
  })}{filteredRows.length === 0 && <tr><td colSpan={4}>{rows.length === 0 && entity === 'customers' ? 'No subscribers yet. Add your first subscriber to this workspace.' : 'No matching records.'}</td></tr>}</tbody></table></div></div></section>
}

export default AdminDashboard
