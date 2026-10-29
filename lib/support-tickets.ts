export const SUPPORT_TICKET_CATEGORIES = [
  'no_internet',
  'password_change',
  'slow_speed',
  'other',
] as const

export type SupportTicketCategory = typeof SUPPORT_TICKET_CATEGORIES[number]

export function supportTicketCategoryLabel(category: string) {
  switch (category) {
    case 'no_internet': return 'No internet'
    case 'password_change': return 'Password change'
    case 'slow_speed': return 'Slow speed'
    default: return 'Other'
  }
}
