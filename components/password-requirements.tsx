import { Check, Circle } from 'lucide-react'
import { getPasswordRequirements } from '@/lib/password-policy'

export function PasswordRequirement({ met, children }: { met: boolean; children: string }) {
  const Icon = met ? Check : Circle
  return (
    <li className={met ? 'password-rule is-met' : 'password-rule'}>
      <Icon size={14} aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}

export function PasswordRequirements({ password }: { password: string }) {
  return (
    <ul className="password-rules" aria-label="Password requirements">
      {getPasswordRequirements(password).map((requirement) => (
        <PasswordRequirement key={requirement.id} met={requirement.met}>{requirement.label}</PasswordRequirement>
      ))}
    </ul>
  )
}
