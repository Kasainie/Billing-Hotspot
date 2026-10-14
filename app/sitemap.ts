import type { MetadataRoute } from 'next'

const siteUrl = 'https://billing.lktech.life'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: 'monthly',
      priority: 1,
    },
  ]
}
