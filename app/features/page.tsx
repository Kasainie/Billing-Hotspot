import type { Metadata } from 'next'
import { MarketingFeatureIndex } from '@/components/marketing-feature-pages'

export const metadata: Metadata = {
  title: 'Platform Features',
  description: 'Explore LKTECH subscriber access, payment workflows, and MikroTik network operations.',
  alternates: { canonical: '/features' },
}

export default function FeaturesPage() {
  return <MarketingFeatureIndex />
}
