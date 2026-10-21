import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MarketingFeatureDetail } from '@/components/marketing-feature-pages'
import { marketingFeatures } from '@/lib/marketing-features'

type FeaturePageProps = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return marketingFeatures.map(({ slug }) => ({ slug }))
}

export async function generateMetadata({ params }: FeaturePageProps): Promise<Metadata> {
  const { slug } = await params
  const feature = marketingFeatures.find((item) => item.slug === slug)
  if (!feature) return { title: 'Feature not found' }
  return {
    title: feature.title,
    description: feature.summary,
    alternates: { canonical: `/features/${feature.slug}` },
  }
}

export default async function FeatureDetailPage({ params }: FeaturePageProps) {
  const { slug } = await params
  const feature = marketingFeatures.find((item) => item.slug === slug)
  if (!feature) notFound()
  return <MarketingFeatureDetail feature={feature} />
}
