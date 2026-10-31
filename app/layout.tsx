import type { Metadata, Viewport } from 'next'
import { AdminPasswordConfirmation } from '@/components/admin-password-confirmation'
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

function NetworkFlowVisual() {
  return (
    <svg
      className="site-network-visual"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="network-globe-fill" cx="48%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#00e5ff" stopOpacity=".09" />
          <stop offset="72%" stopColor="#00e5ff" stopOpacity=".025" />
          <stop offset="100%" stopColor="#00ff90" stopOpacity=".01" />
        </radialGradient>
        <linearGradient id="network-link-cyan" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00e5ff" stopOpacity=".08" />
          <stop offset="48%" stopColor="#62e8f4" stopOpacity=".72" />
          <stop offset="100%" stopColor="#00ff90" stopOpacity=".16" />
        </linearGradient>
      </defs>

      <g className="network-globe">
        <circle className="network-globe-fill" cx="1055" cy="452" r="278" fill="url(#network-globe-fill)" />
        <ellipse className="network-orbit" cx="1055" cy="452" rx="330" ry="116" transform="rotate(-23 1055 452)" />
        <ellipse className="network-orbit network-orbit-delayed" cx="1055" cy="452" rx="330" ry="116" transform="rotate(29 1055 452)" />
        <ellipse className="network-sphere-line" cx="1055" cy="452" rx="238" ry="278" />
        <ellipse className="network-sphere-line" cx="1055" cy="452" rx="122" ry="278" />
        <ellipse className="network-sphere-line" cx="1055" cy="452" rx="278" ry="94" />
        <ellipse className="network-sphere-line" cx="1055" cy="452" rx="278" ry="190" />

        <path className="network-link network-link-flow" d="M804 367 Q930 259 1055 452 T1306 537" />
        <path className="network-link network-link-flow network-link-delayed" d="M858 602 Q946 507 1055 452 T1252 300" />
        <path className="network-link network-link-flow" d="M918 247 Q967 351 1055 452 T1192 690" />
        <path className="network-link network-link-flow network-link-delayed" d="M770 501 Q917 453 1055 452 T1351 399" />
        <path className="network-link network-link-flow" d="M881 666 Q951 553 1055 452 T1157 238" />

        <g className="network-nodes">
          <circle className="network-node" cx="804" cy="367" r="5" />
          <circle className="network-node network-node-delayed" cx="858" cy="602" r="4" />
          <circle className="network-node" cx="918" cy="247" r="4" />
          <circle className="network-node network-node-delayed" cx="770" cy="501" r="5" />
          <circle className="network-node" cx="881" cy="666" r="4" />
          <circle className="network-node network-node-core" cx="1055" cy="452" r="7" />
          <circle className="network-node network-node-delayed" cx="1157" cy="238" r="4" />
          <circle className="network-node" cx="1192" cy="690" r="5" />
          <circle className="network-node network-node-delayed" cx="1252" cy="300" r="4" />
          <circle className="network-node" cx="1306" cy="537" r="5" />
          <circle className="network-node network-node-delayed" cx="1351" cy="399" r="4" />
        </g>
      </g>

      <g className="network-edge-nodes">
        <path className="network-link network-link-flow network-edge-link" d="M624 679 Q736 612 804 501" />
        <path className="network-link network-link-flow network-edge-link network-link-delayed" d="M490 278 Q650 302 804 367" />
        <path className="network-link network-link-flow network-edge-link" d="M389 440 Q596 452 770 501" />
        <path className="network-link network-link-flow network-edge-link network-link-delayed" d="M671 741 Q783 690 881 666" />

        <g className="network-router-float" transform="translate(530 654)">
          <path className="network-router-antenna" d="M20 24 11 2M77 23 89 2" />
          <circle className="network-router-antenna-tip" cx="11" cy="2" r="2" />
          <circle className="network-router-antenna-tip" cx="89" cy="2" r="2" />
          <rect className="network-router-body" x="0" y="23" width="100" height="37" rx="8" />
          <path className="network-router-highlight" d="M9 25h82" />
          <text className="network-router-label" x="50" y="43" textAnchor="middle">MikroTik</text>
          <circle className="network-router-led" cx="12" cy="52" r="2" />
          <circle className="network-router-led network-router-led-delay" cx="21" cy="52" r="2" />
          <path className="network-router-port" d="M73 50h6m4 0h6m4 0h-1" />
        </g>

        <g className="network-wireless-float" transform="translate(438 245)">
          <circle className="network-wireless-ring" r="25" />
          <circle className="network-wireless-ring network-wireless-ring-delay" r="35" />
          <path className="network-wireless-icon" d="M-15 -4a22 22 0 0 1 30 0M-10 2a14 14 0 0 1 20 0M-5 8a7 7 0 0 1 10 0" />
          <circle className="network-wireless-core" cy="14" r="3" />
          <circle className="network-wireless-node" cx="-31" cy="4" r="3" />
        </g>

        <g className="network-wireless-float network-wireless-float-delay" transform="translate(721 770)">
          <circle className="network-wireless-ring" r="22" />
          <circle className="network-wireless-ring network-wireless-ring-delay" r="31" />
          <path className="network-wireless-icon" d="M-13 -3a19 19 0 0 1 26 0M-9 3a12 12 0 0 1 18 0M-4 9a6 6 0 0 1 8 0" />
          <circle className="network-wireless-core" cy="15" r="3" />
          <circle className="network-wireless-node" cx="28" cy="-7" r="3" />
        </g>

        <g className="network-wireless-float network-wireless-float-delay" transform="translate(354 450)">
          <circle className="network-wireless-ring" r="18" />
          <path className="network-wireless-icon" d="M-10 -2a15 15 0 0 1 20 0M-6 4a9 9 0 0 1 12 0M-3 9a4 4 0 0 1 6 0" />
          <circle className="network-wireless-core" cy="14" r="2.5" />
          <circle className="network-wireless-node" cx="21" cy="1" r="2.5" />
        </g>
      </g>
    </svg>
  )
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
        <NetworkFlowVisual />
        <AdminPasswordConfirmation />
      </body>
    </html>
  )
}
