import { ResetPasswordForm } from '@/components/password-reset-form'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Choose a new password',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />
}
