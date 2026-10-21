export const marketingFeatures = [
  {
    slug: 'access',
    number: '01',
    label: 'ACCESS',
    title: 'Subscriber access, in one workspace',
    summary: 'Manage Hotspot and PPPoE subscribers, service plans, active sessions, and account history together.',
    description: 'LKTECH brings the day-to-day subscriber workflows into one workspace, from account setup and service plans to live session visibility and billing history.',
    capabilities: [
      {
        title: 'Hotspot and PPPoE accounts',
        description: 'Keep subscriber records, service type, site, plan, account status, and expiry details together.',
      },
      {
        title: 'Plans and session visibility',
        description: 'Review active sessions, connected devices, session duration, data usage, and available download/upload rates.',
      },
      {
        title: 'Subscriber history',
        description: 'Open a subscriber profile to review payments, invoices, credits, package purchases, support tickets, and recorded session activity.',
      },
    ],
    requirements: 'Live session rates and router-specific activity depend on the router connector reporting counters. Session history reflects accounting records received by the RADIUS server.',
    icon: 'access',
  },
  {
    slug: 'payments',
    number: '02',
    label: 'PAYMENTS',
    title: 'Payments linked to internet access',
    summary: 'Connect workspace payment credentials to customer checkouts and review incoming payments in the billing workspace.',
    description: 'Payment setup is scoped to each ISP workspace. LKTECH verifies a provider’s payment status before recording a payment or granting package access.',
    capabilities: [
      {
        title: 'Workspace M-Pesa setup',
        description: 'Configure the workspace’s own Safaricom Daraja credentials for sandbox or production use. Saved credentials are encrypted and are not displayed again.',
      },
      {
        title: 'Verified customer checkouts',
        description: 'Hotspot and PPPoE package purchases are fulfilled only after the provider confirms the transaction and the amount, currency, and reference match.',
      },
      {
        title: 'PayBill reconciliation',
        description: 'Match direct PayBill transactions to PPPoE accounts. Exact account and plan-amount matches can renew automatically; unmatched transactions remain available for staff review.',
      },
      {
        title: 'Additional hosted gateways',
        description: 'Pesapal and IntaSend integrations are available when the workspace has configured its own merchant credentials. A provider account and valid credentials are required before checkout can use them.',
      },
    ],
    requirements: 'A workspace must configure credentials and callback settings for the chosen provider before accepting payments. A browser redirect alone does not confirm a payment.',
    icon: 'payments',
  },
  {
    slug: 'network',
    number: '03',
    label: 'NETWORK',
    title: 'MikroTik setup and network visibility',
    summary: 'Link MikroTik routers, configure Hotspot or PPPoE subscriber services, and monitor router health from the dashboard.',
    description: 'Use the guided RouterOS provisioning flow to register a router and select subscriber services, then use the dashboard to check router status, sessions, and reported metrics.',
    capabilities: [
      {
        title: 'Guided router provisioning',
        description: 'Create a one-time script for a MikroTik router, choose Hotspot, PPPoE, or both, and configure the selected subscriber ports and RADIUS-backed services.',
      },
      {
        title: 'Router health and telemetry',
        description: 'With monitoring enabled, review online/offline status, heartbeats, resource metrics, and reported Hotspot and PPPoE user counts. The monitor reports about every 30 seconds.',
      },
      {
        title: 'Router details',
        description: 'When the RouterOS connector is available, inspect router-reported logs, backups, scheduler entries, scripts, and session information.',
      },
    ],
    requirements: 'Router provisioning and monitoring require a compatible MikroTik RouterOS device and a working connection to LKTECH. One-time provisioning script links expire after 15 minutes.',
    icon: 'network',
  },
] as const

export type MarketingFeature = (typeof marketingFeatures)[number]
