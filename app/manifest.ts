import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'LKTECH | Hotspot and ISP Billing',
    short_name: 'LKTECH',
    description: 'Manage hotspot and PPPoE billing, subscriber access, M-Pesa payments, and MikroTik network operations.',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    background_color: '#090812',
    theme_color: '#090812',
    categories: ['business', 'productivity', 'utilities'],
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
