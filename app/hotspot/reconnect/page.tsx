import { HotspotCheckout } from '@/components/hotspot-checkout'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reconnect to hotspot',
  robots: { index: false, follow: false },
}

export default function HotspotReconnectPage() {
  return <HotspotCheckout mode="reconnect" />
}