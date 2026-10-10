export const hotspotPortalTemplates = [
  {
    id: 'original',
    name: 'Midnight Green',
    description: 'Deep navy, crisp white and a lively green accent.',
    background: '#071c2d',
    surface: '#102b3d',
    accent: '#22c78a',
    previewText: '#f4fbff',
    stylesheet: null,
  },
  {
    id: 'fresh',
    name: 'Fresh Start',
    description: 'Warm ivory, leafy green and a calm, natural feel.',
    background: '#e8f0e6',
    surface: '#ffffff',
    accent: '#287a59',
    previewText: '#19372b',
    stylesheet: 'fresh.css',
  },
  {
    id: 'skyline',
    name: 'Open Sky',
    description: 'Clear sky blue with confident, polished blue controls.',
    background: '#e8f2fc',
    surface: '#ffffff',
    accent: '#236fc2',
    previewText: '#18334c',
    stylesheet: 'skyline.css',
  },
  {
    id: 'copperline',
    name: 'Copperline',
    description: 'Soft sand and rich terracotta for a welcoming look.',
    background: '#f3ece3',
    surface: '#fffdf9',
    accent: '#ad4e32',
    previewText: '#392e29',
    stylesheet: 'copperline.css',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Sleek charcoal panels with a sharp lime highlight.',
    background: '#171e24',
    surface: '#252e35',
    accent: '#c4e765',
    previewText: '#f5f8f2',
    stylesheet: 'graphite.css',
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    description: 'Rich midnight blue with bright, clear cyan actions.',
    background: '#102e56',
    surface: '#173e6b',
    accent: '#54d6f2',
    previewText: '#f2f9ff',
    stylesheet: 'cobalt.css',
  },
  {
    id: 'lagoon',
    name: 'Lagoon',
    description: 'Sea-glass greens, soft white and deep teal accents.',
    background: '#dff1eb',
    surface: '#f8fcfa',
    accent: '#087f76',
    previewText: '#173a36',
    stylesheet: 'lagoon.css',
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Soft blush, warm ivory and a refined berry-red accent.',
    background: '#f4e7e4',
    surface: '#fffaf8',
    accent: '#b8494d',
    previewText: '#39272b',
    stylesheet: 'ember.css',
  },
] as const

export const defaultHotspotPortalBranding = {
  companyName: 'LKTECH',
  welcomeHeadline: 'Connect to what matters.',
  welcomeMessage: 'Work, learn, stream, and stay close to the people who matter. Choose a plan and get online.',
  supportMessage: 'Need help? Contact your network operator.',
} as const

export type HotspotPortalTemplateId = (typeof hotspotPortalTemplates)[number]['id']

export function isHotspotPortalTemplateId(value: unknown): value is HotspotPortalTemplateId {
  return hotspotPortalTemplates.some((template) => template.id === value)
}