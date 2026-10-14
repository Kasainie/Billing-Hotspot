import { AuthForm } from '@/components/auth-form'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Create an LKTECH account to set up your ISP billing and operations workspace.',
  robots: { index: false, follow: true },
}

export default function SignupPage() {
  return <AuthForm mode="signup" />
}
