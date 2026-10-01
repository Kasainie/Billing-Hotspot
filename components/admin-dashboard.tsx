'use client'

import { useEffect, useMemo, useState } from 'react'
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
  FileText,
  Gauge,
  Globe2,
  LayoutDashboard,
  Map,
  MessageCircle,
  Menu,
  MoreHorizontal,
  Network,
  Package,
  Router,
  Search,
  Server,
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
import { buildSubscriberServiceScript, parseServiceSubnet } from '@/lib/router-provisioning'

const sites = [
  { name: 'Central Hub', code: 'CH-001', customers: 184, sessions: 126, health: 99.8, status: 'Online', color: 'cyan' },
  { name: 'North Ridge', code: 'NR-004', customers: 96, sessions: 58, health: 98.6, status: 'Online', color: 'green' },
  { name: 'Lakeside Estate', code: 'LE-007', customers: 72, sessions: 41, health: 96.2, status: 'Degraded', color: 'amber' },
  { name: 'Market District', code: 'MD-011', customers: 118, sessions: 83, health: 99.1, status: 'Online', color: 'cyan' },
]

const sessions = [
  { user: 'Amina Yusuf', site: 'Central Hub', plan: 'Pro 50', usage: '7.2 GB', speed: '42.8 Mbps', time: '02h 14m', state: 'Active' },
  { user: 'Daniel Osei', site: 'Market District', plan: 'Home 20', usage: '3.8 GB', speed: '18.1 Mbps', time: '01h 48m', state: 'Active' },
  { user: 'Kofi Mensah', site: 'North Ridge', plan: 'Pro 50', usage: '12.4 GB', speed: '46.2 Mbps', time: '04h 02m', state: 'Active' },
  { user: 'Grace Boateng', site: 'Lakeside Estate', plan: 'Starter 10', usage: '1.1 GB', speed: '9.6 Mbps', time: '00h 36m', state: 'Active' },
]

const payments = [
  { name: 'Amina Yusuf', ref: 'PAY-84521', amount: '$24.00', method: 'Mobile Money', time: '2 min ago', status: 'Paid' },
  { name: 'Samuel Antwi', ref: 'PAY-84520', amount: '$12.00', method: 'Card', time: '18 min ago', status: 'Paid' },
  { name: 'Mercy Owusu', ref: 'PAY-84519', amount: '$36.00', method: 'Mobile Money', time: '41 min ago', status: 'Pending' },
]

const navigationSections: { label?: string; items: { label: string; icon: LucideIcon; count?: string; children?: { label: string; view: string; icon?: LucideIcon }[] }[] }[] = [
  { items: [{ label: 'Overview', icon: LayoutDashboard }] },
  { label: 'CUSTOMERS', items: [
    { label: 'Subscribers', icon: Users, count: '2' },
    { label: 'Leads', icon: Activity },
    { label: 'Tickets', icon: MessageCircle, children: [{ label: 'List', view: 'Ticket list' }, { label: 'Analytics', view: 'Ticket analytics' }] },
  ] },
  { label: 'NETWORK', items: [
    { label: 'Live sessions', icon: Wifi },
    { label: 'Plans', icon: Package },
    { label: 'Devices', icon: Router, children: [{ label: 'Routers', view: 'Routers', icon: Network }, { label: 'TR-069', view: 'TR-069' }, { label: 'Equipment', view: 'Equipment', icon: Server }] },
    { label: 'Fiber map', icon: Map },
  ] },
  { label: 'FINANCE', items: [
    { label: 'Billing', icon: FileText, children: [{ label: 'Payments', view: 'Payments', icon: CreditCard }, { label: 'Invoices', view: 'Invoices' }, { label: 'Expenses', view: 'Expenses' }] },
    { label: 'Vouchers', icon: Ticket, children: [{ label: 'List', view: 'Voucher list' }, { label: 'Generate', view: 'Generate vouchers' }, { label: 'Analytics', view: 'Voucher analytics' }] },
  ] },
]

const crudEntityByPage: Partial<Record<string, 'customers' | 'packages' | 'payments' | 'sites'>> = {
  Subscribers: 'customers',
  Plans: 'packages',
  Payments: 'payments',
}

function StatusDot({ tone = 'green' }: { tone?: 'green' | 'amber' | 'red' | 'cyan' }) {
  return <span className={`status-dot status-${tone}`} aria-hidden="true" />
}

function MetricCard({ label, value, change, icon: Icon, tone, detail }: { label: string; value: string; change: string; icon: typeof Activity; tone: string; detail: string }) {
  return (
    <article className="metric-card">
      <div className="metric-top"><span className="eyebrow">{label}</span><span className={`metric-icon ${tone}`}><Icon size={17} /></span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom"><span className="positive"><ArrowUpRight size={13} /> {change}</span><span>{detail}</span></div>
    </article>
  )
}

export function AdminDashboard() {
  const [activeNav, setActiveNav] = useState('Routers')
  const [expandedNav, setExpandedNav] = useState(['Tickets', 'Devices', 'Billing', 'Vouchers'])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [siteFilter, setSiteFilter] = useState('All sites')
  const [range, setRange] = useState('30 days')
  const [showAllSites, setShowAllSites] = useState(false)
  const [liveSites, setLiveSites] = useState<typeof sites>([])
  const [dataStatus, setDataStatus] = useState<'demo' | 'live'>('demo')

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Dashboard API unavailable')))
      .then((data) => {
        if (!cancelled && Array.isArray(data.sites) && data.sites.length > 0) {
          setLiveSites(data.sites.map((site: { name: string; id: string; customersCount: number; status: string; monthlyRevenue: number }) => ({
            name: site.name,
            code: site.id.slice(0, 6).toUpperCase(),
            customers: site.customersCount,
            sessions: 0,
            health: site.status === 'active' ? 99.9 : 96.2,
            status: site.status === 'active' ? 'Online' : 'Degraded',
            color: site.status === 'active' ? 'cyan' : 'amber',
          })))
          setDataStatus('live')
        }
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const displayedSites = liveSites.length > 0 ? liveSites : sites
  const filteredSites = useMemo(() => displayedSites.filter((site) => `${site.name} ${site.code}`.toLowerCase().includes(query.toLowerCase()) && (siteFilter === 'All sites' || site.name === siteFilter)), [displayedSites, query, siteFilter])
  const visibleSites = showAllSites ? filteredSites : filteredSites.slice(0, 3)

  return (
    <main className="ops-shell">
      <aside className={`ops-sidebar ${mobileOpen ? 'is-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div className="brand-row"><div className="brand-mark"><Signal size={18} /></div><div><strong>Raven 4</strong></div><button className="icon-button collapse-button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}>{sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button><button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
        <nav className="navigation-list" aria-label="Main navigation">{navigationSections.map((section) => <div className="nav-section" key={section.label || 'overview'}>{section.label && <p className="nav-label">{section.label}</p>}{section.items.map(({ label, icon: Icon, count, children }) => <div className="nav-group" key={label}><button className={`nav-item ${activeNav === label ? 'active' : ''}`} aria-expanded={children ? expandedNav.includes(label) : undefined} onClick={() => { if (children) { setExpandedNav((current) => current.includes(label) ? current.filter((group) => group !== label) : [...current, label]); return } setActiveNav(label); setMobileOpen(false) }}><Icon size={17} /><span>{label}</span>{count && <b>{count}</b>}{children && (expandedNav.includes(label) ? <ChevronDown className="nav-chevron" size={15} /> : <ChevronRight className="nav-chevron" size={15} />)}</button>{children && expandedNav.includes(label) && <div className="nav-children">{children.map(({ label: childLabel, view, icon: ChildIcon }) => <button key={view} className={`nav-child ${activeNav === view ? 'active' : ''}`} onClick={() => { setActiveNav(view); setMobileOpen(false) }}>{ChildIcon ? <ChildIcon size={15} /> : <span className="nav-child-dot" />}<span>{childLabel}</span></button>)}</div>}</div>)}</div>)}</nav>
        <div className="sidebar-footer"><div className="support-card"><div className="support-icon"><Cable size={16} /></div><strong>Need help?</strong><span>Check the integration guide</span><a href="#activity">Open docs <ArrowUpRight size={12} /></a></div><div className="user-row"><div className="avatar">KM</div><div><strong>Kwame Mensah</strong><span>Super admin</span></div><MoreHorizontal size={17} className="muted-icon" /></div></div>
      </aside>

      <section className="ops-content">
        <header className="topbar"><button className="icon-button menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{activeNav}</strong></div><div className="top-actions"><label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anything" aria-label="Search anything" /><kbd>⌘ K</kbd></label><button className="icon-button notification" aria-label="Notifications"><Bell size={17} /><i /></button><div className="top-avatar">KM</div></div></header>
        <div className="page-wrap">
          {activeNav === 'Routers' ? <RouterProvisioning onExit={() => setActiveNav('Overview')} onProvision={() => setActiveNav('Subscribers')} /> : activeNav !== 'Overview' ? crudEntityByPage[activeNav] ? <CrudPanel entity={crudEntityByPage[activeNav]!} /> : <ModulePanel title={activeNav} /> : null}
          {activeNav === 'Overview' ? <>
          <div className="page-heading"><div><div className="live-label"><StatusDot tone="green" /> LIVE OPERATIONS</div><h1>Good morning, Kwame.</h1><p>Here&apos;s what&apos;s happening across your network today.</p></div><div className="heading-actions"><button className="outline-button"><SlidersHorizontal size={15} /> Customize</button><button className="primary-button"><ArrowDownRight size={15} /> Export report</button></div></div>
          <div className="status-strip"><div><span className="status-strip-label">NETWORK STATUS</span><strong><StatusDot /> All systems operational</strong></div><div className="status-services"><span><StatusDot /> Central router</span><span><StatusDot /> RADIUS</span><span><StatusDot /> Starlink uplink</span></div><span className="last-sync">{dataStatus === 'live' ? 'Live Neon data' : 'Demo data · API ready'}</span></div>
          <div className="metrics-grid"><MetricCard label="Total revenue" value="$18,420" change="12.8%" detail="vs last month" icon={CircleDollarSign} tone="cyan" /><MetricCard label="Active customers" value="470" change="8.4%" detail="vs last month" icon={Users} tone="green" /><MetricCard label="Live sessions" value="308" change="5.2%" detail="vs yesterday" icon={Wifi} tone="blue" /><MetricCard label="Network uptime" value="99.7%" change="0.3%" detail="vs last month" icon={Server} tone="amber" /></div>

          <div className="section-toolbar"><div><h2>Network overview</h2><p>Monitor sites, routers, and subscriber activity in real time.</p></div><div className="toolbar-controls"><select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} aria-label="Filter sites"><option>All sites</option>{displayedSites.map((site) => <option key={site.name}>{site.name}</option>)}</select><select value={range} onChange={(event) => setRange(event.target.value)} aria-label="Select time range"><option>30 days</option><option>7 days</option><option>24 hours</option></select></div></div>
          <div className="overview-grid"><section className="panel site-panel"><div className="panel-heading"><div><h3>Site health</h3><span>4 sites · 470 customers</span></div><button className="text-button" onClick={() => setShowAllSites((value) => !value)}>{showAllSites ? 'Show less' : 'View all'} <ArrowUpRight size={13} /></button></div>{visibleSites.map((site) => <div className="site-row" key={site.code}><div className={`site-icon site-${site.color}`}><Globe2 size={17} /></div><div className="site-info"><strong>{site.name}</strong><span>{site.code} · {site.customers} customers</span></div><div className="site-stat"><strong>{site.sessions}</strong><span>sessions</span></div><div className="health"><div><strong>{site.health}%</strong><StatusDot tone={site.status === 'Degraded' ? 'amber' : 'green'} /></div><span>{site.status}</span></div></div>)}</section><section className="panel revenue-panel"><div className="panel-heading"><div><h3>Revenue performance</h3><span>Gross revenue · {range}</span></div><button className="icon-button"><MoreHorizontal size={17} /></button></div><div className="revenue-total"><strong>$18,420</strong><span><ArrowUpRight size={13} /> 12.8%</span></div><div className="chart" aria-label="Revenue chart"><div className="chart-grid"><i /><i /><i /><i /></div><svg viewBox="0 0 500 130" role="img" aria-label="Revenue trend rising over 30 days" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2dd4bf" stopOpacity=".22" /><stop offset="1" stopColor="#2dd4bf" stopOpacity="0" /></linearGradient></defs><path d="M0 108 C36 98, 48 100, 75 88 S112 88, 136 94 S164 78, 190 82 S224 62, 250 69 S283 50, 312 59 S349 45, 370 49 S407 22, 432 31 S466 16, 500 8 L500 130 L0 130 Z" fill="url(#area)" /><path d="M0 108 C36 98, 48 100, 75 88 S112 88, 136 94 S164 78, 190 82 S224 62, 250 69 S283 50, 312 59 S349 45, 370 49 S407 22, 432 31 S466 16, 500 8" fill="none" stroke="#2dd4bf" strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg><div className="chart-labels"><span>Jun 01</span><span>Jun 08</span><span>Jun 15</span><span>Jun 22</span><span>Jun 30</span></div></div></section></div>

          <div className="lower-grid"><section className="panel table-panel"><div className="panel-heading"><div><h3>Active sessions</h3><span>Live bandwidth usage across all sites</span></div><button className="text-button">Manage sessions <ArrowUpRight size={13} /></button></div><div className="table-scroll"><table><thead><tr><th>Subscriber</th><th>Site / package</th><th>Usage</th><th>Speed</th><th>Duration</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.user}><td><div className="table-user"><div className="mini-avatar">{session.user.split(' ').map((name) => name[0]).join('')}</div><strong>{session.user}</strong></div></td><td><strong>{session.site}</strong><span>{session.plan}</span></td><td className="mono">{session.usage}</td><td className="mono cyan-text">{session.speed}</td><td className="mono">{session.time}</td></tr>)}</tbody></table></div></section><section className="panel payments-panel"><div className="panel-heading"><div><h3>Recent payments</h3><span>Latest transactions</span></div><button className="text-button">View all <ArrowUpRight size={13} /></button></div>{payments.map((payment) => <div className="payment-row" key={payment.ref}><div className="payment-icon"><CreditCard size={15} /></div><div className="payment-info"><strong>{payment.name}</strong><span>{payment.ref} · {payment.method}</span></div><div className="payment-amount"><strong>{payment.amount}</strong><span className={payment.status === 'Pending' ? 'pending' : 'paid'}>{payment.status}</span></div><time>{payment.time}</time></div>)}</section></div>

          <div className="bottom-grid"><section className="panel expirations"><div className="panel-heading"><div><h3>Expiring soon</h3><span>Subscriptions ending in the next 7 days</span></div><button className="text-button">See calendar <ArrowUpRight size={13} /></button></div><div className="expiry-list"><div><div className="mini-avatar orange">AO</div><span><strong>Adwoa Ofori</strong><small>Pro 50 · Central Hub</small></span><b>Tomorrow</b></div><div><div className="mini-avatar purple">JN</div><span><strong>Joseph Nartey</strong><small>Home 20 · North Ridge</small></span><b>in 3 days</b></div><div><div className="mini-avatar blue">EA</div><span><strong>Esther Addo</strong><small>Starter 10 · Market District</small></span><b>in 6 days</b></div></div></section><section className="panel activity-panel" id="activity"><div className="panel-heading"><div><h3>Activity log</h3><span>Latest changes by your team</span></div><button className="icon-button"><MoreHorizontal size={17} /></button></div><div className="activity-list"><div><span className="activity-line" /><div className="activity-icon green"><Users size={14} /></div><span><strong>New customer registered</strong><small>Kwesi Appiah · 4 minutes ago</small></span></div><div><span className="activity-line" /><div className="activity-icon cyan"><Settings2 size={14} /></div><span><strong>Package updated</strong><small>Pro 50 · by Kwame Mensah</small></span></div><div><div className="activity-icon amber"><AlertTriangle size={14} /></div><span><strong>Lakeside Estate degraded</strong><small>Packet loss above 3% · 18 minutes ago</small></span></div></div></section></div>
          </> : null}
          <footer className="footer-bar"><span>netgrid control plane · v2.4.0</span><span><StatusDot /> Systems checked 12 sec ago</span><span>© 2024 Acme Networks</span></footer>
        </div>
      </section>
    </main>
  )
}

type RouterInventory = {
  interfaces: Array<{ name: string; running: boolean; disabled: boolean }>
  bridgePorts: Array<{ interface: string; bridge: string }>
  wanInterfaces: string[]
  bridgeName: string | null
}

function RouterProvisioning({ onExit, onProvision }: { onExit: () => void; onProvision: () => void }) {
  const [step, setStep] = useState(0)
  const [routerName, setRouterName] = useState('MikroTik Main')
  const [siteName, setSiteName] = useState('Central Hub')
  const [provisioningAdminKey, setProvisioningAdminKey] = useState('')
  const hotspotProfile = 'default'
  const [provisioningId, setProvisioningId] = useState('')
  const [fetchCommand, setFetchCommand] = useState('')
  const [provisioningState, setProvisioningState] = useState<'idle' | 'creating' | 'pending' | 'downloaded' | 'applied' | 'expired' | 'error'>('idle')
  const [provisioningMessage, setProvisioningMessage] = useState('')
  const [provisioningSourceIp, setProvisioningSourceIp] = useState('')
  const [routerInventory, setRouterInventory] = useState<RouterInventory | null>(null)
  const [inventoryInitialized, setInventoryInitialized] = useState(false)
  const [selectedPorts, setSelectedPorts] = useState<string[]>([])
  const [hotspotSubnet, setHotspotSubnet] = useState('172.31.0.0/24')
  const [pppoeSubnet, setPppoeSubnet] = useState('172.31.1.0/24')
  const [applyCommand, setApplyCommand] = useState('')
  const [preparingConfiguration, setPreparingConfiguration] = useState(false)
  const [configurationError, setConfigurationError] = useState('')
  const [services, setServices] = useState(['PPPoE', 'Hotspot'])
  const [copied, setCopied] = useState<'router' | null>(null)

  const safeIdentity = routerName.trim().replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, ' ').slice(0, 48) || 'MikroTik Main'
  const steps = ['Identity', 'Provision', 'Services', 'Done']
  const requiresProvisioningKey = process.env.NODE_ENV !== 'development'
  const hotspotNetwork = parseServiceSubnet(hotspotSubnet)
  const pppoeNetwork = parseServiceSubnet(pppoeSubnet)
  const duplicateServiceNetworks = Boolean(hotspotNetwork && pppoeNetwork && hotspotNetwork.cidr === pppoeNetwork.cidr)
  const toggleService = (service: string) => setServices((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service])
  const togglePort = (port: string) => setSelectedPorts((current) => current.includes(port) ? current.filter((item) => item !== port) : [...current, port])

  const createRouterConfiguration = async () => {
    const bridgeName = routerInventory?.bridgeName || 'centripid-bridge'
    const wanInterfaces = new Set(routerInventory?.wanInterfaces || [])
    const validInterfaces = new Set(routerInventory?.interfaces.map((item) => item.name) || [])
    const ports = selectedPorts.filter((port) => validInterfaces.has(port) && !wanInterfaces.has(port))
    if (ports.length === 0) {
      setConfigurationError('Select at least one subscriber port; the detected WAN port cannot be bridged.')
      return
    }
    setPreparingConfiguration(true)
    setConfigurationError('')
    try {
      const configScript = buildSubscriberServiceScript({
        bridgeName,
        ports,
        services,
        hotspotSubnet: services.includes('Hotspot') ? hotspotSubnet : undefined,
        pppoeSubnet: services.includes('PPPoE') ? pppoeSubnet : undefined,
      })
      const provisioningToken = fetchCommand.match(/\/provision\/([A-Za-z0-9_-]{43})["/]/)?.[1]
      if (!provisioningToken) throw new Error('Create a new provisioning script before preparing router configuration.')

      const response = await fetch('/api/routers/provisioning', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...(requiresProvisioningKey ? { 'x-provisioning-admin-key': provisioningAdminKey } : {}) },
        body: JSON.stringify({ token: provisioningToken, configScript }),
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
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not create provisioning link')
      setProvisioningId(result.id)
      setFetchCommand(result.fetchCommand)
      setProvisioningState('pending')
      setProvisioningMessage('Waiting for the router to fetch and apply the script...')
      setStep(1)
    } catch (error) {
      setProvisioningState('error')
      setProvisioningMessage(error instanceof Error ? error.message : 'Could not create provisioning link')
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
        const bridgeName = inventory.bridgeName || 'centripid-bridge'
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
        if (result.routerData) {
          const inventory = result.routerData as RouterInventory
          setRouterInventory(inventory)
          if (!inventoryInitialized) {
            const bridgeName = inventory.bridgeName || 'centripid-bridge'
            const existingPorts = inventory.bridgePorts
              .filter((port) => port.bridge === bridgeName && !inventory.wanInterfaces.includes(port.interface))
              .map((port) => port.interface)
            setSelectedPorts(existingPorts)
            setInventoryInitialized(true)
          }
        }
        if (result.status === 'applied' && result.routerData?.interfaces?.length) {
          setProvisioningMessage('MikroTik is online')
          setStep(2)
        }
        else if (result.status === 'applied') setProvisioningMessage('Router online; waiting for interface discovery')
        else if (result.status === 'downloaded') setProvisioningMessage('Script downloaded; waiting for RouterOS to finish and confirm')
        else if (result.status === 'expired') setProvisioningMessage('Provisioning link expired. Create a new script to continue.')
        else setProvisioningMessage('Waiting for the router to fetch and apply the script...')
      } catch {
        if (active) setProvisioningMessage('Waiting for the router to fetch and apply the script...')
      }
    }

    void checkStatus()
    const timer = window.setInterval(checkStatus, 2500)
    return () => { active = false; window.clearInterval(timer) }
  }, [provisioningId, provisioningAdminKey, requiresProvisioningKey, inventoryInitialized])

  const createScriptButtonLabel = provisioningState === 'creating' ? 'Creating script...' : fetchCommand ? 'Create a new script' : 'Create WinBox script'
  const provisionExpiryNote = 'This one-time script link expires in 15 minutes.'

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

          <button className="primary-button provision-subscribers-button" onClick={createProvisioningScript} disabled={!routerName.trim() || provisioningState === 'creating' || (requiresProvisioningKey && provisioningAdminKey.length < 32)}>{createScriptButtonLabel}</button>
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

          <div className={`provision-notice ${provisioningState === 'applied' ? '' : 'pending-notice'}`} role="status">{provisioningState === 'applied' ? <CircleCheck size={17} /> : provisioningState === 'error' || provisioningState === 'expired' ? <AlertTriangle size={17} /> : <Clock3 size={17} />}<span>{provisioningMessage || 'Checking connection...'}{provisioningState === 'applied' && provisioningSourceIp ? ` at ${provisioningSourceIp}` : ''}</span></div>
        </>}

        {step === 2 && <>
          <div className="provision-card-heading"><h2>Service types</h2><p>Choose what this router should run for subscribers.</p></div>
          <section className="router-setup-section">
            <p className="router-setup-hint">Select one or both services to configure.</p>
            <div className="service-options">{['PPPoE', 'Hotspot'].map((service) => <label className="service-option" key={service}><input type="checkbox" checked={services.includes(service)} onChange={() => toggleService(service)} /><span><strong>{service}</strong><small>{service === 'PPPoE' ? 'Always-on broadband subscribers' : 'Captive portal & vouchers'}</small></span></label>)}</div>
          </section>

          <section className="router-setup-section">
            <div className="router-setup-title"><div><h2>Bridge ports</h2><p>Interfaces that join the subscriber bridge.</p></div><button className="text-button" onClick={refreshRouterInventory}>Refresh</button></div>
            <div className="uplink-warning"><AlertTriangle size={16} /><div><strong>Don't bridge the uplink port</strong><p>{routerInventory?.wanInterfaces.length ? `${routerInventory.wanInterfaces.join(', ')} runs the router's DHCP client; leave it unselected.` : 'No DHCP uplink was detected. Confirm the WAN port manually before selecting interfaces.'}</p></div></div>
            {routerInventory ? <div className="router-port-list">{routerInventory.interfaces.map((port) => {
              const isWan = routerInventory.wanInterfaces.includes(port.name)
              const existingBridge = routerInventory.bridgePorts.find((item) => item.interface === port.name)?.bridge
              const lockedToOtherBridge = Boolean(existingBridge && existingBridge !== (routerInventory.bridgeName || 'centripid-bridge'))
              return <label className={`router-port${selectedPorts.includes(port.name) ? ' selected' : ''}${isWan || lockedToOtherBridge ? ' unavailable' : ''}`} key={port.name}>
                <input type="checkbox" checked={selectedPorts.includes(port.name)} disabled={isWan || lockedToOtherBridge} onChange={() => togglePort(port.name)} />
                <span><strong>{port.name}</strong><small>{isWan ? 'Uplink / WAN · leave unselected' : lockedToOtherBridge ? `Already on ${existingBridge}` : existingBridge || 'Add to subscriber bridge'}</small></span>
                {isWan && <b>UPLINK / WAN</b>}
              </label>
            })}</div> : <p className="router-setup-hint">Waiting for router interface discovery. Keep the provisioning page open.</p>}
          </section>

          <section className="router-setup-section subnet-section">
            <div className="router-setup-title"><div><h2>Subscriber networks</h2><p>Private /24 networks for subscriber access. Existing WAN settings are left unchanged.</p></div></div>
            {services.includes('Hotspot') && <label className="subnet-input">Hotspot and DHCP network<input value={hotspotSubnet} onChange={(event) => setHotspotSubnet(event.target.value)} aria-invalid={!hotspotNetwork} placeholder="172.31.0.0/24" /></label>}
            {services.includes('PPPoE') && <label className="subnet-input">PPPoE address pool<input value={pppoeSubnet} onChange={(event) => setPppoeSubnet(event.target.value)} aria-invalid={!pppoeNetwork} placeholder="172.31.1.0/24" /></label>}
            <p className="router-setup-hint">Hotspot creates a DHCP pool, RADIUS login profile, portal, and NAT rule. PPPoE creates a RADIUS-backed server and address pool. The script stops if an unmanaged server already uses the selected bridge.</p>
            {duplicateServiceNetworks && <p className="router-discovery-status error" role="alert">Hotspot and PPPoE must use different networks.</p>}
            {((services.includes('Hotspot') && !hotspotNetwork) || (services.includes('PPPoE') && !pppoeNetwork)) && <p className="router-discovery-status error" role="alert">Enter a private network ending in `.0/24`, such as 172.31.0.0/24.</p>}
          </section>

          {configurationError && <p className="router-discovery-status error" role="alert">{configurationError}</p>}
          <button className="wizard-next apply-router-config" disabled={preparingConfiguration || !routerInventory || !selectedPorts.some((port) => !routerInventory.wanInterfaces.includes(port)) || services.length === 0 || (services.includes('Hotspot') && !hotspotNetwork) || (services.includes('PPPoE') && !pppoeNetwork) || duplicateServiceNetworks} onClick={createRouterConfiguration}>{preparingConfiguration ? 'Preparing configuration...' : 'Prepare configuration'}<ArrowRight size={15} /></button>
        </>}

        {step === 3 && <>
          <div className="provision-card-heading"><h2>Apply router configuration</h2><p>Paste this command in WinBox → New Terminal to download and apply the selected settings.</p></div>
          <div className="script-frame"><pre>{applyCommand}</pre><button className="script-copy" onClick={() => copyConfig(applyCommand)}><Copy size={14} />{copied === 'router' ? 'Copied' : 'Copy script'}</button></div>
          <div className="provision-notice pending-notice"><AlertTriangle size={17} /><span>The detected WAN port is excluded. Review the script before applying; unmanaged services on the bridge will cause it to stop rather than overwrite them.</span></div>
          <div className="provision-summary"><div><span>ROUTER</span><strong>{safeIdentity}</strong></div><div><span>BRIDGE PORTS</span><strong>{selectedPorts.filter((port) => !routerInventory?.wanInterfaces.includes(port)).join(', ')}</strong></div><div><span>SERVICES</span><strong>{services.join(', ')}</strong></div></div>
        </>}
      </section>

      <div className="provision-footer">
        <button className="wizard-back" onClick={() => step === 0 ? onExit() : setStep((current) => current - 1)}><ArrowLeft size={15} />Back</button>
        {step < steps.length - 1 && step !== 2 && <button className="wizard-next" disabled={(step === 0 && (!routerName.trim() || !fetchCommand || (requiresProvisioningKey && provisioningAdminKey.length < 32))) || (step === 1 && provisioningState !== 'applied')} onClick={() => setStep((current) => current + 1)}>{step === 0 ? 'Provision' : 'Configure services'}<ArrowRight size={15} /></button>}
        {step === steps.length - 1 && <button className="wizard-next" onClick={onExit}>Done<Check size={15} /></button>}
      </div>
    </section>
  )
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

function CrudPanel({ entity }: { entity: 'sites' | 'customers' | 'packages' | 'payments' }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [name, setName] = useState('')
  const [detail, setDetail] = useState('')
  const [radiusUsername, setRadiusUsername] = useState('')
  const [radiusPassword, setRadiusPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const labels = { sites: 'Routers', customers: 'Subscribers', packages: 'Plans', payments: 'Payments' }

  const load = () => fetch(`/api/${entity}`).then((response) => response.json()).then((data) => setRows(Array.isArray(data) ? data : []))
  useEffect(() => { load().catch(() => setMessage('Could not load live records')) }, [entity])
  const create = async () => {
    if (!name.trim()) return setMessage('A name is required')
    if (entity === 'customers' && (!radiusUsername.trim() || !radiusPassword)) return setMessage('RADIUS username and password are required')
    setSaving(true)
    const body = entity === 'sites'
      ? { name, location: detail || 'Central Sector' }
      : entity === 'customers'
        ? { name, email: detail, radiusUsername, password: radiusPassword }
        : entity === 'packages'
          ? { name, downloadMbps: 20, uploadMbps: 10, monthlyPrice: 1800 }
          : { amount: 1800, method: detail || 'Mobile Money', reference: `PAY-${Date.now()}` }
    try {
      const response = await fetch(`/api/${entity}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (!response.ok) return setMessage((await response.json()).error || 'Unable to save record')
      setName(''); setDetail(''); setRadiusUsername(''); setRadiusPassword('')
      setMessage(entity === 'customers' ? 'Subscriber and RADIUS login created' : 'Record created')
      await load()
    } catch {
      setMessage('Unable to save record')
    } finally {
      setSaving(false)
    }
  }
  const remove = async (id: string) => { await fetch(`/api/${entity}?id=${id}`, { method: 'DELETE' }); load() }
  return <section className="crud-workspace"><div className="page-heading"><div><div className="live-label"><StatusDot /> LIVE DATA</div><h1>{labels[entity]}</h1><p>Manage records persisted in Supabase.</p></div><button className="primary-button" onClick={create} disabled={saving}>{saving ? 'Saving...' : 'Add record'}</button></div><div className="crud-form"><input value={name} onChange={(event) => setName(event.target.value)} placeholder={entity === 'payments' ? 'Amount or payment label' : `${labels[entity]} name`} aria-label="Record name" /><input value={detail} onChange={(event) => setDetail(event.target.value)} placeholder={entity === 'sites' ? 'Location' : entity === 'customers' ? 'Email' : 'Method or detail'} aria-label="Record detail" />{entity === 'customers' && <><input value={radiusUsername} onChange={(event) => setRadiusUsername(event.target.value)} placeholder="RADIUS username" aria-label="RADIUS username" autoComplete="username" /><input type="password" value={radiusPassword} onChange={(event) => setRadiusPassword(event.target.value)} placeholder="RADIUS password (12+ characters)" aria-label="RADIUS password" autoComplete="new-password" /></>}<button className="outline-button" onClick={create} disabled={saving}>Create</button>{message && <span className="form-message">{message}</span>}</div><div className="panel crud-table"><div className="panel-heading"><div><h3>Records</h3><span>{rows.length} loaded from Supabase</span></div><button className="text-button" onClick={load}>Refresh</button></div><div className="table-scroll"><table><thead><tr><th>Name / ID</th><th>Status</th><th>Details</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)}><td><strong>{String(row.name || row.reference || row.id).slice(0, 34)}</strong></td><td><span className="table-status">{String(row.status || (row.active ? 'active' : 'inactive'))}</span></td><td className="mono">{String(row.radiusUsername || row.location || row.email || row.monthlyPrice || row.amount || '')}</td><td><button className="text-button danger-text" onClick={() => remove(String(row.id))}>Delete</button></td></tr>)}</tbody></table></div></div></section>
}

export default AdminDashboard
