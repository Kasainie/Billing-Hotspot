import { ArrowLeft, ArrowRight, CreditCard, Radio, Router, Wifi } from 'lucide-react'
import Link from 'next/link'
import { BrandWordmark } from '@/components/brand-wordmark'
import { marketingFeatures, type MarketingFeature } from '@/lib/marketing-features'

const featureIcons = {
  access: Wifi,
  payments: CreditCard,
  network: Router,
} as const

function FeatureHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-[#F8FAFC]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link href="/" className="marketing-link flex items-center gap-2.5" aria-label="LKTECH home">
          <span className="grid size-9 place-items-center rounded-xl bg-[#0F172A] text-white shadow-sm"><Radio size={18} strokeWidth={2.3} /></span>
          <BrandWordmark primary="LKTECH" accent="." tone="dark" className="text-[17px] font-extrabold tracking-[-0.06em]" />
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-4">
          <Link href="/features" className="marketing-link rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-600 transition-colors hover:text-[#2563EB]">Features</Link>
          <Link href="/login" className="marketing-link hidden rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-600 transition-colors hover:text-[#0F172A] sm:inline-flex">Sign in</Link>
          <Link href="/signup" className="marketing-link inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_5px_14px_rgba(37,99,235,0.2)] transition-all hover:-translate-y-0.5 hover:bg-blue-700">Get started <ArrowRight size={15} /></Link>
        </nav>
      </div>
    </header>
  )
}

function FeatureFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <span>© 2026 LKTECH™. All rights reserved.</span>
        <nav aria-label="Footer navigation" className="flex gap-5">
          <Link href="/features" className="marketing-link transition-colors hover:text-[#2563EB]">Features</Link>
          <Link href="/downloads" className="marketing-link transition-colors hover:text-[#2563EB]">Download apps</Link>
          <Link href="/terms" className="marketing-link transition-colors hover:text-[#2563EB]">Terms</Link>
        </nav>
      </div>
    </footer>
  )
}

function FeatureIcon({ feature, size = 20 }: { feature: MarketingFeature; size?: number }) {
  const Icon = featureIcons[feature.icon]
  return <Icon size={size} aria-hidden="true" />
}

export function MarketingFeatureIndex() {
  return (
    <main className="marketing-tech-site min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <FeatureHeader />
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24 lg:px-10">
        <Link href="/" className="marketing-link inline-flex items-center gap-2 text-sm font-semibold text-[#2563EB]"><ArrowLeft size={15} /> Back to home</Link>
        <div className="mt-8 max-w-3xl">
          <p className="font-mono text-[11px] font-medium tracking-[0.12em] text-[#2563EB]">LKTECH PLATFORM</p>
          <h1 className="mt-4 font-bold tracking-[-0.055em] text-[#0F172A] text-4xl sm:text-5xl">Tools for connected ISP operations.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#334155]">Explore how subscriber access, customer payments, and MikroTik operations work in LKTECH—plus the setup each area needs.</p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {marketingFeatures.map((feature) => (
            <article key={feature.slug} className="flex flex-col rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-medium tracking-[0.1em] text-slate-500">{feature.label} / {feature.number}</span>
                <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-[#2563EB]"><FeatureIcon feature={feature} /></span>
              </div>
              <h2 className="mt-8 text-xl font-bold tracking-[-0.04em]">{feature.title}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-[#334155]">{feature.summary}</p>
              <Link href={`/features/${feature.slug}`} className="marketing-link mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#2563EB] transition-all hover:gap-3">Explore {feature.label.toLowerCase()} <ArrowRight size={14} /></Link>
            </article>
          ))}
        </div>
        <section className="mt-10 rounded-2xl bg-[#0F172A] px-6 py-8 text-white sm:px-9">
          <h2 className="text-xl font-bold tracking-[-0.035em]">A few setup details matter</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Connectors and workspace-specific provider credentials determine which live network and payment workflows are available. Each feature page explains the relevant requirements before you get started.</p>
          <Link href="/signup" className="marketing-link mt-5 inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500">Create your workspace <ArrowRight size={15} /></Link>
        </section>
      </section>
      <FeatureFooter />
    </main>
  )
}

export function MarketingFeatureDetail({ feature }: { feature: MarketingFeature }) {
  return (
    <main className="marketing-tech-site min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <FeatureHeader />
      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-20 lg:px-10">
        <Link href="/features" className="marketing-link inline-flex items-center gap-2 text-sm font-semibold text-[#2563EB]"><ArrowLeft size={15} /> All features</Link>
        <div className="mt-9 grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <p className="font-mono text-[11px] font-medium tracking-[0.12em] text-[#2563EB]">{feature.label} / {feature.number}</p>
            <h1 className="mt-4 text-4xl font-bold tracking-[-0.055em] sm:text-5xl">{feature.title}</h1>
            <p className="mt-5 text-base leading-7 text-[#334155]">{feature.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="marketing-link inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-5 py-3 text-sm font-semibold text-white shadow-[0_5px_14px_rgba(37,99,235,0.2)] transition-all hover:-translate-y-0.5 hover:bg-blue-700">Get started <ArrowRight size={15} /></Link>
              <Link href="/" className="marketing-link inline-flex items-center rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-[#0F172A] transition-colors hover:border-blue-200 hover:text-[#2563EB]">Back to home</Link>
            </div>
          </div>
          <div className="space-y-4">
            {feature.capabilities.map((capability, index) => (
              <article key={capability.title} className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.025)] sm:p-6">
                <div className="flex items-start gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#2563EB]"><FeatureIcon feature={feature} size={18} /></span>
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.1em] text-slate-500">CAPABILITY 0{index + 1}</p>
                    <h2 className="mt-1 text-base font-bold tracking-[-0.025em]">{capability.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-[#334155]">{capability.description}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
        <aside className="mt-12 rounded-2xl border border-blue-100 bg-blue-50/70 p-5 sm:p-6">
          <h2 className="text-sm font-bold text-[#0F172A]">Setup and availability</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[#334155]">{feature.requirements}</p>
        </aside>
        <nav aria-label="Other platform features" className="mt-10 flex flex-wrap gap-3">
          {marketingFeatures.filter((item) => item.slug !== feature.slug).map((item) => (
            <Link key={item.slug} href={`/features/${item.slug}`} className="marketing-link inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#334155] transition-colors hover:border-blue-200 hover:text-[#2563EB]">
              {item.title} <ArrowRight size={14} />
            </Link>
          ))}
        </nav>
      </section>
      <FeatureFooter />
    </main>
  )
}
