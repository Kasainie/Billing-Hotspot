export const hotspotPortalTemplates = [
  {
    id: 'original',
    name: 'LKTech Original',
    description: 'The current LKTech look.',
    background: '#082b47',
    surface: '#061c2f',
    accent: '#16b86b',
    previewText: '#ffffff',
    stylesheet: null,
  },
  {
    id: 'fresh',
    name: 'Fresh Start',
    description: 'Light panels with a split desktop layout.',
    background: '#eaf2e6',
    surface: '#ffffff',
    accent: '#19805e',
    previewText: '#1d352d',
    stylesheet: 'fresh.css',
  },
  {
    id: 'skyline',
    name: 'Open Sky',
    description: 'A bright blue layout with roomier package choices.',
    background: '#e9f3fb',
    surface: '#ffffff',
    accent: '#1768a6',
    previewText: '#203849',
    stylesheet: 'skyline.css',
  },
  {
    id: 'copperline',
    name: 'Copperline',
    description: 'Crisp white panels with coral accents.',
    background: '#edf2f5',
    surface: '#ffffff',
    accent: '#d45f4b',
    previewText: '#243746',
    stylesheet: 'copperline.css',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'A compact dark layout with lime highlights.',
    background: '#20282d',
    surface: '#2b353a',
    accent: '#c5e14d',
    previewText: '#ffffff',
    stylesheet: 'graphite.css',
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    description: 'Confident blue panels with clear cyan actions.',
    background: '#123e72',
    surface: '#0e325f',
    accent: '#44c8ec',
    previewText: '#ffffff',
    stylesheet: 'cobalt.css',
  },
  {
    id: 'lagoon',
    name: 'Lagoon',
    description: 'Airy sea-glass tones with deep teal controls.',
    background: '#dff3ee',
    surface: '#f5fbf8',
    accent: '#047f7b',
    previewText: '#1d3d3a',
    stylesheet: 'lagoon.css',
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Warm white surfaces with a precise red accent.',
    background: '#f5e9e7',
    surface: '#ffffff',
    accent: '#c64f45',
    previewText: '#3a2928',
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