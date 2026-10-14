import { ForgotPasswordForm } from '@/components/password-reset-form'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
