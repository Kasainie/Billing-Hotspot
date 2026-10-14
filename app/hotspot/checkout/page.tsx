import { HotspotCheckout } from '@/components/hotspot-checkout'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Hotspot checkout',
  robots: { index: false, follow: false },
}

export default function HotspotCheckoutPage() {
  return <HotspotCheckout />
}