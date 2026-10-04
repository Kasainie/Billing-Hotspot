# Hotspot M-Pesa Checkout

The captive portal uses Safaricom Daraja STK Push. A purchase is only provisioned after the callback is checked with Safaricom's STK query endpoint. M-Pesa PINs are entered in Safaricom's phone prompt, never on the portal.

## Database

Link the Supabase CLI to the production project, then apply the migration:

```powershell
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

The application database role must be able to insert into `hotspot_purchases`, `radcheck`, `radreply`, and `payments`. FreeRADIUS must read the new voucher rows from `radcheck` and `radreply`. For a multi-ISP deployment, apply every migration, including `20261004120000_make_multitenant.sql`.

## Multi-location Hotspot

All owned MikroTik access points must use the same RADIUS server and shared database. Each router must also be registered as a RADIUS client. The portal remembers a device by the MAC address MikroTik supplies; using the same SSID at each location helps devices keep the same private MAC address.

Enable the FreeRADIUS `expiration` module in the `authorize` section after SQL. The application writes an absolute `Expiration` check item for each package, and this module rejects expired accounts and caps `Session-Timeout` to the remaining package time. Apply migration `20261001140000_hotspot_roaming_expiration.sql`, deploy the application, then refresh the hotspot portal files on each router. A user with an older paid package must sign in once at an owned hotspot so its device can be associated with that account.

## Portal Designs

Apply migrations `20261001150000_hotspot_portal_templates.sql`, `20261001160000_expand_hotspot_portal_templates.sql`, and `20261002100000_add_hotspot_portal_branding.sql`, then deploy the application. Refresh portal files on existing routers once so their login page loads the live theme stylesheet and saved company branding from billing. **Network → Portal design** lets admins customize the company name, welcome copy, and support line for every hotspot location.

## Vercel Environment

Each ISP workspace configures its own Daraja credentials during `/get-started` or later in **Billing → Payment settings**. Set `TENANT_SECRETS_ENCRYPTION_KEY` as an encrypted server-side Production environment variable before a workspace owner saves credentials. Generate a 32-byte key as described in the [multitenant deployment guide](./multitenancy.md). Workspace credentials are encrypted before they are stored.

The legacy environment settings below remain supported for the existing `default` workspace. Newly created workspaces must save their own credentials in the dashboard.

- `MPESA_ENV`: `sandbox` or `production`
- `MPESA_CONSUMER_KEY`
- `MPESA_CONSUMER_SECRET`
- `MPESA_SHORTCODE`
- `MPESA_PASSKEY`
- `MPESA_CALLBACK_URL`: `https://billing.lktech.life/api/hotspot/daraja/callback`

The integration currently uses the PayBill STK transaction type (`CustomerPayBillOnline`). Confirm the shortcode and Daraja app are enabled for STK Push.

## Router

New Hotspot configuration scripts add `billing.lktech.life` to the MikroTik Hotspot walled garden. For routers already configured, add this once from RouterOS:

```routeros
:if ([:len [/ip hotspot walled-garden find where dst-host="billing.lktech.life" and action="allow"]] = 0) do={/ip hotspot walled-garden add dst-host="billing.lktech.life" action=allow comment="billing-system-managed-portal"}
```

Refresh the captive portal files on an existing router:

```routeros
/tool fetch url="https://billing.lktech.life/hotspot/hotspot-files.rsc" dst-path=hotspot-files.rsc; :delay 2s; /import hotspot-files.rsc
```

For a non-default workspace, include its slug in the bundle URL, for example `https://billing.lktech.life/hotspot/hotspot-files.rsc?tenant=acme-network`. The provisioning flow does this automatically. The router-delivered login page now opens `/hotspot`, the subscription experience where customers can choose hotspot Wi-Fi or home PPPoE plans. Hotspot purchases retain the workspace, client MAC, and router sign-in return URL; after checkout customers can return to enter their Wi-Fi credentials. Refresh the portal files on existing routers after each portal update. PPPoE signups also require the [PPPoE account migration and setup](./pppoe-mpesa-setup.md).

Before production launch, confirm `billing.lktech.life` resolves to the Vercel project and that `/hotspot` and `/api/hotspot/packages` return successfully over HTTPS. Checkout remains unavailable until required database migrations, that workspace's live Daraja credentials, and router walled-garden access are all configured.
