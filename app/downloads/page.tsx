import { ArrowDownToLine, ArrowLeft, Monitor, Smartphone } from 'lucide-react'
import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import Link from 'next/link'
import { BrandWordmark } from '@/components/brand-wordmark'

const downloadHeading = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-download-heading' })

export const metadata: Metadata = {
  title: 'Download LKTECH apps',
  description: 'Download LKTECH for Android or Windows, with separate installers for 32-bit and 64-bit PCs.',
  alternates: { canonical: '/downloads' },
}

const downloads = [
  {
    platform: 'Android',
    title: 'LKTECH for Android',
    detail: 'Android APK · 9 MB · v1.0.1',
    requirement: 'Install the APK on your Android device. An internet connection is required.',
    file: '/downloads/LKTECH-Android-1.0.1.apk',
    icon: Smartphone,
    badge: 'ANDROID',
  },
  {
    platform: 'Windows 64-bit',
    title: 'LKTECH for Windows',
    detail: '64-bit installer · 98 MB',
    requirement: 'For 64-bit Windows PCs. Choose this for most modern laptops and desktops.',
    file: '/downloads/LKTECH-Windows-x64-1.0.0.exe',
    icon: Monitor,
    badge: 'WINDOWS · X64',
  },
  {
    platform: 'Windows 32-bit',
    title: 'LKTECH for Windows',
    detail: '32-bit installer · 85 MB',
    requirement: 'For 32-bit Windows PCs. This version also runs on 64-bit Windows.',
    file: '/downloads/LKTECH-Windows-ia32-1.0.0.exe',
    icon: Monitor,
    badge: 'WINDOWS · IA32',
  },
]

export default function DownloadsPage() {
  return (
    <main className={`${downloadHeading.variable} min-h-screen bg-[#F8FAFC] text-[#0F172A]`}>
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="marketing-link flex items-center gap-2.5" aria-label="LKTECH home">
            <span className="grid size-9 place-items-center rounded-xl bg-[#0F172A] text-white">
              <Monitor size={18} />
            </span>
            <BrandWordmark primary="LKTECH" accent="." className="text-[17px] font-extrabold tracking-[-0.06em]" />
          </Link>
          <Link href="/login" className="marketing-link text-sm font-semibold text-slate-600 transition-colors hover:text-[#2563EB]">
            Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20">
        <Link href="/" className="marketing-link mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-[#2563EB]">
          <ArrowLeft size={16} /> Back to LKTECH
        </Link>
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-semibold tracking-[0.14em] text-[#2563EB]">LKTECH APPS</p>
          <h1 className="mt-3 font-[var(--font-download-heading)] text-4xl font-extrabold tracking-[-0.055em] text-[#0F172A] sm:text-5xl">
            Download LKTECH
          </h1>
          <p className="mt-5 text-base leading-7 text-[#334155] sm:text-lg">
            Choose the installer for your device. The apps connect to the hosted LKTECH service and need an internet connection.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {downloads.map(({ platform, title, detail, requirement, file, icon: Icon, badge }) => (
            <article key={platform} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 font-mono text-[10px] font-semibold tracking-wide text-blue-700">
                <Icon size={13} /> {badge}
              </span>
              <h2 className="mt-6 text-xl font-bold tracking-tight text-[#0F172A]">{title}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{detail}</p>
              <p className="mt-4 min-h-12 text-sm leading-6 text-[#334155]">{requirement}</p>
              <a
                href={file}
                download
                className="marketing-link mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 text-sm font-semibold text-white shadow-[0_5px_14px_rgba(37,99,235,0.18)] transition-all hover:-translate-y-0.5 hover:bg-blue-700"
              >
                <ArrowDownToLine size={16} /> Download {platform}
              </a>
            </article>
          ))}
        </div>

        <aside className="mt-8 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm leading-6 text-slate-600">
          The Windows installers are unsigned, so Windows may show a SmartScreen warning. The Android APK is a sideload build, not a Play Store release.
        </aside>
      </section>
    </main>
  )
}
