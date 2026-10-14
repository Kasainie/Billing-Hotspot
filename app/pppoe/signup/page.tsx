import { PppoeCheckout } from '@/components/pppoe-checkout'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'PPPoE signup',
  robots: { index: false, follow: false },
}

export default function PppoeSignupPage() {
  return <PppoeCheckout />
}
