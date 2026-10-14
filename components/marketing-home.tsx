import Link from 'next/link'

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
    title: 'Hotspot billing',
    description: 'Manage internet packages, subscriber access, active sessions, and hotspot payment records in one workspace.',
  },
  {
    number: '02',
    title: 'PPPoE subscribers',
    description: 'Handle PPPoE plans, customer accounts, signups, and payment reconciliation alongside hotspot services.',
  },
  {
    number: '03',
    title: 'M-Pesa payments',
    description: 'Connect mobile-money payment flows to internet packages and review payment activity for your ISP.',
  },
  {
    number: '04',
    title: 'MikroTik operations',
    description: 'Use guided router provisioning and monitoring tools to support your network operations.',
  },
]

export function MarketingHome() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productSchemaJson }} />
      <main className="min-h-screen bg-[#f3f4f1] text-[#1e2933]">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 sm:px-10">
          <Link href="/" className="text-lg font-bold tracking-tight" aria-label="LKTECH home">
            LKTECH<span className="text-[#21856d]">.</span>
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-3">
            <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-semibold text-[#334155] hover:bg-white">
              Sign in
            </Link>
            <Link href="/signup" className="rounded-lg bg-[#1f252a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#343b40]">
              Create account
            </Link>
          </nav>
        </header>

        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_15%,rgba(44,185,160,0.16),transparent_38%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-14 sm:px-10 sm:pb-28 sm:pt-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-[#21856d]">ISP operations, made clearer</p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
                Hotspot and ISP billing, all in one place.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[#58666d] sm:text-lg">
                Manage hotspot and PPPoE billing, subscriber access, M-Pesa payments, and MikroTik network operations with LKTECH.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="rounded-lg bg-[#1f252a] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#343b40]">
                  Get started
                </Link>
                <a href="#features" className="rounded-lg border border-[#d8dfdc] bg-white/70 px-5 py-3 text-sm font-semibold text-[#334155] hover:bg-white">
                  Explore features
                </a>
              </div>
              <p className="mt-5 text-sm text-[#718087]">Built for internet service providers managing subscriber access and billing.</p>
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/85 p-6 shadow-[0_24px_70px_rgba(25,46,39,0.10)] backdrop-blur sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#21856d]">ISP workspace</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">A connected view of your services</h2>
              <p className="mt-3 text-sm leading-6 text-[#64727a]">
                Bring core subscriber, payment, and network workflows together, from a customer&apos;s package to the router serving them.
              </p>
              <div className="mt-7 grid grid-cols-2 gap-3">
                {['Hotspot', 'PPPoE', 'Payments', 'Routers'].map((item) => (
                  <div key={item} className="rounded-xl border border-[#e7ece9] bg-[#f8faf8] px-4 py-4">
                    <span className="block h-2 w-2 rounded-full bg-[#2cb9a0]" aria-hidden="true" />
                    <span className="mt-3 block text-sm font-semibold text-[#334155]">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-6 sm:px-10">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#21856d]">One operations workspace</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Tools for everyday ISP operations</h2>
              <p className="mt-4 leading-7 text-[#64727a]">
                Keep subscriber billing and network workflows organized as your internet service grows.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <article key={feature.number} className="rounded-2xl border border-[#e7ece9] bg-[#fbfcfb] p-6">
                  <span className="text-xs font-bold tracking-[0.12em] text-[#21856d]">{feature.number}</span>
                  <h3 className="mt-8 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#64727a]">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16 sm:px-10 sm:py-20">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-[#1f252a] px-7 py-9 text-white sm:flex-row sm:items-center sm:px-10">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Bring your ISP workflows together.</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">Create a workspace to get started with LKTECH.</p>
            </div>
            <Link href="/signup" className="shrink-0 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[#1f252a] hover:bg-[#eaf5f1]">
              Create your account
            </Link>
          </div>
        </section>

        <footer className="border-t border-[#e1e7e4]">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-7 text-sm text-[#718087] sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <span>LKTECH ISP operations</span>
            <nav aria-label="Footer navigation" className="flex gap-5">
              <Link href="/login" className="hover:text-[#21856d]">Sign in</Link>
              <Link href="/signup" className="hover:text-[#21856d]">Create account</Link>
            </nav>
          </div>
        </footer>
      </main>
    </>
  )
}
