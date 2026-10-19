import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CreditCard,
  Radio,
  Router,
  ShieldCheck,
  Wifi,
  Zap,
} from 'lucide-react'
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import Link from 'next/link'
import { BrandWordmark } from '@/components/brand-wordmark'

const landingSans = Inter({ subsets: ['latin'], variable: '--font-landing-sans' })
const landingHeading = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-landing-heading' })
const landingMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-landing-mono' })

const productSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'LKTECH',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://billing.lktech.life/',
  description: 'ISP operations software for hotspot and PPPoE billing, subscriber management, M-Pesa payments, and MikroTik router operations.',
}

const productSchemaJson = JSON.stringify(productSchema).replace(/</g, '\\u003c')

const features = [
  {
    number: '01',
    label: 'ACCESS',
    title: 'One view of every subscriber',
    description: 'Manage hotspot and PPPoE accounts, plans, sessions, and customer details from one clear workspace.',
    icon: Wifi,
    iconStyle: 'bg-blue-50 text-blue-600',
  },
  {
    number: '02',
    label: 'PAYMENTS',
    title: 'Payments that stay in sync',
    description: 'Connect M-Pesa payments to internet packages and reconcile activity without jumping between tools.',
    icon: CreditCard,
    iconStyle: 'bg-emerald-50 text-emerald-700',
  },
  {
    number: '03',
    label: 'NETWORK',
    title: 'Know what’s happening on your network',
    description: 'Provision MikroTik routers and keep an eye on network status, active sessions, and operations.',
    icon: Router,
    iconStyle: 'bg-indigo-50 text-indigo-700',
  },
]

const chartBars = [34, 49, 38, 59, 45, 70, 54, 80, 60, 72, 52, 91, 66, 84, 58, 76, 96, 72, 88, 63, 79, 100, 73, 90]

export function MarketingHome() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productSchemaJson }} />
      <main id="marketing-landing" className={`${landingSans.variable} ${landingHeading.variable} ${landingMono.variable} min-h-screen overflow-hidden bg-[#F8FAFC] text-[#0F172A]`}>
        <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-[#F8FAFC]/90 backdrop-blur-xl">
          <div className="relative mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
            <Link href="/" className="marketing-link flex items-center gap-2.5" aria-label="LKTECH home">
              <span className="grid size-9 place-items-center rounded-xl bg-[#0F172A] text-white shadow-sm">
                <Radio size={18} strokeWidth={2.3} />
              </span>
              <BrandWordmark primary="LKTECH" accent="." className="text-[17px] font-extrabold tracking-[-0.06em]" />
            </Link>

            <nav aria-label="Main navigation" className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex">
              <a href="#platform" className="marketing-link text-[13px] font-medium text-slate-600 transition-colors hover:text-[#2563EB]">Platform</a>
              <a href="#features" className="marketing-link text-[13px] font-medium text-slate-600 transition-colors hover:text-[#2563EB]">Features</a>
              <a href="#how-it-works" className="marketing-link text-[13px] font-medium text-slate-600 transition-colors hover:text-[#2563EB]">How it works</a>
            </nav>

            <div className="flex items-center gap-2.5">
              <Link href="/login" className="marketing-link hidden rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-600 transition-colors hover:text-[#0F172A] sm:inline-flex">
                Sign in
              </Link>
              <Link href="/signup" className="marketing-link inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_5px_14px_rgba(37,99,235,0.2)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_8px_20px_rgba(37,99,235,0.28)]">
                Get started <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </header>

        <section id="platform" className="relative">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_78%_28%,rgba(37,99,235,0.08),transparent_34%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[0.94fr_1.06fr] lg:gap-10 lg:px-10 lg:pb-28 lg:pt-24">
            <div className="max-w-[590px]">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3.5 py-2 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <span className="landing-mono text-[10px] font-medium tracking-[0.08em] text-slate-600">ISP OPERATIONS PLATFORM</span>
              </div>
              <h1 className="font-[var(--font-landing-heading)] text-[42px] font-extrabold leading-[1.08] tracking-[-0.065em] text-[#0F172A] sm:text-[54px] lg:text-[62px]">
                Run your ISP with <span className="text-[#2563EB]">clarity.</span>
              </h1>
              <p className="mt-6 max-w-[520px] text-[16px] leading-7 text-[#334155] sm:text-[17px] sm:leading-[1.8]">
                Billing, subscriber access, M-Pesa payments, and MikroTik operations—connected in one workspace built for internet providers.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link href="/signup" className="marketing-link inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.2)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_12px_25px_rgba(37,99,235,0.27)]">
                  Create your workspace <ArrowRight size={16} />
                </Link>
                <a href="#features" className="marketing-link inline-flex min-h-12 items-center gap-2 px-2 text-sm font-semibold text-[#0F172A] transition-colors hover:text-[#2563EB]">
                  Explore the platform <ArrowDownRight size={16} />
                </a>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-600" /> Built for growing ISPs</span>
                <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-600" /> Hotspot + PPPoE</span>
                <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-600" /> M-Pesa ready</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[620px] lg:ml-auto">
              <div aria-hidden="true" className="absolute -inset-6 rounded-[32px] bg-blue-200/30 blur-3xl" />
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_32px_90px_rgba(15,23,42,0.14)]">
                <div className="flex h-14 items-center justify-between border-b border-slate-100 px-5 sm:px-6">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-7 place-items-center rounded-lg bg-[#0F172A] text-white"><Radio size={14} /></span>
                    <span className="text-xs font-bold tracking-tight text-slate-800">Network overview</span>
                    <ChevronDown size={13} className="text-slate-400" />
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    <span className="landing-mono text-[9px] font-medium text-emerald-700">PREVIEW DATA</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-6">
                  <div className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-500">Active subscribers</span>
                      <span className="grid size-7 place-items-center rounded-lg bg-blue-50 text-blue-600"><Wifi size={14} /></span>
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <strong className="landing-heading text-[27px] font-bold leading-none tracking-[-0.05em] text-[#0F172A]">1,284</strong>
                      <span className="landing-mono inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600"><ArrowUpRight size={12} /> 12.8%</span>
                    </div>
                    <div className="mt-4 flex h-8 items-end gap-1" aria-hidden="true">
                      {[30, 44, 37, 54, 46, 67, 58, 80, 68, 93, 75, 100].map((height, index) => (
                        <span key={index} className={`flex-1 rounded-t-[3px] ${index === 11 ? 'bg-[#2563EB]' : 'bg-blue-100'}`} style={{ height: `${height}%` }} />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-500">Payments today</span>
                      <span className="grid size-7 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><CreditCard size={14} /></span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-end justify-between gap-y-1">
                      <strong className="landing-heading whitespace-nowrap text-[clamp(16px,4.6vw,27px)] font-bold leading-none tracking-[-0.05em] text-[#0F172A]">KES 48,650</strong>
                      <span className="landing-mono text-[9px] text-slate-400">+8.2%</span>
                    </div>
                    <div className="mt-4 flex h-8 items-end gap-1" aria-hidden="true">
                      {[48, 36, 59, 44, 69, 54, 80, 62, 72, 88, 70, 100].map((height, index) => (
                        <span key={index} className={`flex-1 rounded-t-[3px] ${index === 11 ? 'bg-emerald-500' : 'bg-emerald-100'}`} style={{ height: `${height}%` }} />
                      ))}
                    </div>
                  </div>

                  <div className="col-span-2 rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-medium text-slate-500">Revenue activity</p>
                        <p className="landing-heading mt-1 text-[21px] font-bold tracking-[-0.04em] text-[#0F172A]">KES 326,400 <span className="landing-sans text-xs font-medium tracking-normal text-slate-400">this month</span></p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[10px] font-medium text-slate-500">Last 30 days <ChevronDown size={12} /></span>
                    </div>
                    <div className="mt-5 flex h-[104px] items-end gap-[3px] border-b border-l border-slate-100 px-2 pb-0.5 sm:gap-1.5">
                      {chartBars.map((height, index) => (
                        <span key={index} className={`flex-1 rounded-t-[3px] transition-colors ${index > 20 ? 'bg-[#2563EB]' : 'bg-blue-100 hover:bg-blue-300'}`} style={{ height: `${height}%` }} />
                      ))}
                    </div>
                    <div className="landing-mono mt-2 flex justify-between text-[9px] text-slate-400"><span>SEP 01</span><span>SEP 15</span><span>SEP 30</span></div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:px-6">
                  <span className="inline-flex items-center gap-2 text-[10px] font-medium text-slate-500"><span className="size-1.5 rounded-full bg-emerald-500" /> Router fleet connected</span>
                  <span className="landing-mono text-[9px] text-slate-400">ILLUSTRATIVE VIEW</span>
                </div>
              </div>
              <div className="absolute -bottom-5 -left-5 hidden items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_12px_34px_rgba(15,23,42,0.12)] sm:flex">
                <span className="grid size-9 place-items-center rounded-lg bg-[#0F172A] text-white"><ShieldCheck size={17} /></span>
                <span><strong className="block text-xs font-semibold text-[#0F172A]">Operations in sync</strong><small className="mt-0.5 block text-[10px] text-slate-500">Billing to router, connected</small></span>
                <Zap size={15} className="ml-1 text-[#2563EB]" />
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-y border-slate-200/80 bg-white">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-5 px-5 py-6 sm:grid-cols-4 sm:px-8 lg:px-10">
            {[
              ['01', 'Connect your network'],
              ['02', 'Set up your plans'],
              ['03', 'Collect payments'],
              ['04', 'Manage it all'],
            ].map(([number, label]) => (
              <div key={number} className="flex items-center gap-3">
                <span className="landing-mono text-[10px] font-medium text-[#2563EB]">{number}</span>
                <span className="text-xs font-semibold text-slate-700">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <p className="landing-mono text-[11px] font-medium tracking-[0.12em] text-[#2563EB]">ONE CONNECTED PLATFORM</p>
                <h2 className="mt-4 font-[var(--font-landing-heading)] text-3xl font-bold tracking-[-0.055em] text-[#0F172A] sm:text-[42px]">Less switching. More signal.</h2>
                <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#334155]">The essential tools to run your ISP, thoughtfully brought together.</p>
              </div>
              <a href="#get-started" className="marketing-link inline-flex items-center gap-2 pb-1 text-sm font-semibold text-[#2563EB] transition-all hover:gap-3">See what you can do <ArrowRight size={15} /></a>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon
                return (
                  <article key={feature.number} className="group rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.025)] transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)] sm:p-7">
                    <div className="flex items-center justify-between">
                      <span className="landing-mono text-[10px] font-medium tracking-[0.1em] text-slate-500">{feature.label} / {feature.number}</span>
                      <span className={`grid size-10 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105 ${feature.iconStyle}`}><Icon size={18} /></span>
                    </div>
                    <h3 className="mt-9 font-[var(--font-landing-heading)] text-[19px] font-bold tracking-[-0.04em] text-[#0F172A]">{feature.title}</h3>
                    <p className="mt-3 text-[13px] leading-6 text-[#334155]">{feature.description}</p>
                    <a href="#get-started" aria-label={`Learn more about ${feature.title}`} className="marketing-link mt-6 inline-flex items-center gap-2 text-xs font-semibold text-[#2563EB] opacity-80 transition-all group-hover:gap-3 group-hover:opacity-100">Learn more <ArrowRight size={13} /></a>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section id="get-started" className="px-5 pb-16 sm:px-8 sm:pb-20 lg:px-10">
          <div className="relative mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 overflow-hidden rounded-2xl bg-[#0F172A] px-7 py-9 text-white sm:px-10 sm:py-11 md:flex-row md:items-center">
            <div aria-hidden="true" className="absolute -right-12 -top-28 size-72 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="relative">
              <p className="landing-mono text-[10px] font-medium tracking-[0.12em] text-blue-300">READY WHEN YOU ARE</p>
              <h2 className="mt-3 font-[var(--font-landing-heading)] text-2xl font-bold tracking-[-0.045em] sm:text-[30px]">Bring your ISP operations together.</h2>
              <p className="mt-2 text-sm text-slate-300">Start with a workspace built around the way your network runs.</p>
            </div>
            <Link href="/signup" className="marketing-link relative inline-flex min-h-12 shrink-0 items-center gap-2 rounded-lg bg-[#2563EB] px-5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-blue-500">
              Create your workspace <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
            <span className="copyright-notice"><span className="copyright-notice-text">© 2026 LKTECH™. All rights reserved.</span></span>
            <nav aria-label="Footer navigation" className="flex gap-5">
              <Link href="/terms" className="marketing-link transition-colors hover:text-[#2563EB]">Terms</Link>
              <Link href="/login" className="marketing-link transition-colors hover:text-[#2563EB]">Sign in</Link>
              <Link href="/signup" className="marketing-link transition-colors hover:text-[#2563EB]">Create account</Link>
            </nav>
          </div>
        </footer>
      </main>
    </>
  )
}
