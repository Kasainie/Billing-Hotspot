'use client'

import { useState } from 'react'
import { Mail, MessageCircle, Smartphone } from 'lucide-react'
import { SmsSettings } from '@/components/sms-settings'

type Channel = 'SMS' | 'WhatsApp' | 'Email'

const channels: { id: Channel; icon: typeof MessageCircle; description: string }[] = [
  { id: 'SMS', icon: MessageCircle, description: 'Outbox, delivery reports, and gateway setup' },
  { id: 'WhatsApp', icon: Smartphone, description: 'WhatsApp messaging' },
  { id: 'Email', icon: Mail, description: 'Email messaging' },
]

function ChannelUnavailable({ channel }: { channel: 'WhatsApp' | 'Email' }) {
  return <section className="communications-provider-panel">
    <header className="communications-provider-heading">
      <div><span>CHANNEL STATUS</span><h2>{channel}</h2><p>Sending through {channel} is not available yet.</p></div>
      <span className="communications-configured">Not connected</span>
    </header>
    <div className="communications-provider-notice" role="status">
      {channel === 'WhatsApp'
        ? 'WhatsApp Business delivery integration is not enabled. No credentials are collected or saved here.'
        : 'SMTP email delivery integration is not enabled. No email credentials are collected or saved here.'}
    </div>
  </section>
}

export function CommunicationsCenter() {
  const [channel, setChannel] = useState<Channel>('SMS')
  const current = channels.find((item) => item.id === channel)!

  return <section className="communications-center">
    <div className="communications-page-heading">
      <div><span>OUTREACH / COMMUNICATIONS</span><h1>{channel === 'SMS' ? <>SMS <em>outbox.</em></> : `${channel}.`}</h1><p>{current.description}. Manage delivery settings and message activity here.</p></div>
    </div>
    <nav className="communications-channel-tabs" aria-label="Communication channels">
      {channels.map(({ id, icon: Icon }) => <button type="button" key={id} className={channel === id ? 'is-active' : ''} aria-current={channel === id ? 'page' : undefined} onClick={() => setChannel(id)}><Icon size={16} />{id}</button>)}
    </nav>
    {channel === 'SMS' ? <SmsSettings /> : <ChannelUnavailable channel={channel} />}
  </section>
}
