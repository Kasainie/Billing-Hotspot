import { AuthForm } from '@/components/auth-form'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your LKTECH ISP billing and operations workspace.',
  robots: { index: false, follow: true },
}

export default function LoginPage() {
  return <AuthForm mode="login" />
}
