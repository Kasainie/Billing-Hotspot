import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://billing.lktech.life'),
  title: {
    default: 'LKTECH | Hotspot and ISP Billing',
    template: '%s | LKTECH',
  },
  description: 'Manage hotspot and PPPoE billing, subscriber access, M-Pesa payments, and MikroTik network operations with LKTECH.',
  applicationName: 'LKTECH',
  manifest: '/manifest.webmanifest',
  keywords: [
    'hotspot billing',
    'ISP billing software',
    'MikroTik billing',
    'PPPoE billing',
    'M-Pesa internet payments',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_KE',
    siteName: 'LKTECH',
    title: 'LKTECH | Hotspot and ISP Billing',
    description: 'Manage hotspot and PPPoE billing, subscriber access, M-Pesa payments, and MikroTik network operations with LKTECH.',
  },
  twitter: {
    card: 'summary',
    title: 'LKTECH | Hotspot and ISP Billing',
    description: 'Manage hotspot and PPPoE billing, subscriber access, M-Pesa payments, and MikroTik network operations with LKTECH.',
  },
  icons: {
    icon: [
      {
        url: '/icon.svg?v=20261019',
        type: 'image/svg+xml',
      },
      {
        url: '/favicon.ico',
        type: 'image/x-icon',
      },
      {
        url: '/favicon.png',
        type: 'image/png',
        sizes: '256x256',
      },
    ],
    apple: '/apple-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'LKTECH',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#090812',
  userScalable: true,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && process.env.VERCEL === '1' && <Analytics />}
      </body>
    </html>
  )
}
