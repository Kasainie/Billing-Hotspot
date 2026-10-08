# Hotspot M-Pesa Checkout

The MikroTik captive portal provides free-offer activation and existing-account sign-in without navigating customers away from the router login page. Paid M-Pesa checkout and receipt recovery are not linked from the captive portal. The separate billing checkout uses Safaricom Daraja STK Push; purchases are provisioned only after the callback is checked with Safaricom's STK query endpoint. M-Pesa PINs are entered in Safaricom's phone prompt, never on the portal.

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

The managed Hotspot profile sets `dns-name="login.lktech.life"` so RouterOS can resolve the captive login host locally. To update an existing router immediately, run:

```routeros
/ip hotspot profile set [find where name="billing-hotspot-profile"] dns-name="login.lktech.life"
```

Hotspot clients must use the MikroTik Hotspot gateway as their DNS server so captive-network checks on laptops and other clients are intercepted and redirected to the portal. Managed service provisioning configures this automatically and enables RouterOS DNS requests for hotspot clients. On existing routers, run the refreshed `hotspot.rsc` script, or set the matching DHCP network's `dns-server` to its gateway and enable `/ip dns set allow-remote-requests=yes`; then reconnect clients or renew their DHCP leases. Keep the router's input firewall blocking DNS requests from the WAN.

If a laptop does not open its sign-in window automatically, connect to the hotspot and visit `http://neverssl.com` in a browser. This triggers the standard HTTP captive redirect without using HTTPS, which routers cannot transparently redirect.

The router service wizard uses the checked ports as the complete subscriber-bridge membership: checked ports receive Hotspot/PPPoE services, and unchecked interfaces already on that selected bridge are removed from it. Ports on other bridges and marked WAN ports are not moved. Removing a port interrupts devices connected through it. An interface left outside the subscriber bridge is not given this Hotspot DHCP/NAT service; to give a downstream router internet, add its uplink to the subscriber bridge (and it will use the captive/billed service) or configure a separate routed service explicitly.

### Android automatic sign-in

RouterOS can advertise captive-portal discovery to clients using DHCP (RFC 7710/8910). Android requires the advertised portal hostname to present a trusted TLS certificate. The managed router profile enables HTTPS login and selects the certificate only when it finds exactly one trusted certificate whose common name is `login.lktech.life`; without it, provisioning retains HTTP-CHAP and prints a warning rather than configuring a broken HTTPS endpoint.

The public DNS records for `login.lktech.life` currently point to Vercel, not the router, so RouterOS's inbound HTTP ACME challenge cannot issue this certificate. Use DNS-01 instead; it validates a temporary TXT record and does not require changing the A records or exposing router management/HTTP to the internet:

1. Download the Windows `lego` release from [go-acme/lego](https://github.com/go-acme/lego/releases). Create a Vercel API token with permission to manage DNS records for the `lktech.life` zone. Keep the token private; do not paste it into chat or commit it.
2. In PowerShell in the folder containing `lego.exe`, enter the token through the hidden prompt and request the certificate:

   ```powershell
   $secureToken = Read-Host "Vercel DNS API token" -AsSecureString
   $env:VERCEL_API_TOKEN = [System.Net.NetworkCredential]::new("", $secureToken).Password
   .\lego.exe --path .\lego-data --email "YOUR_EMAIL" --dns vercel --domains login.lktech.life run
   Remove-Item Env:VERCEL_API_TOKEN
   ```

   The certificate and key are written under `lego-data\certificates`. Do not share or upload the private key anywhere except directly to the router.
3. Use OpenSSL to package the certificate, private key, and issuer chain as a password-protected PKCS#12 file:

   ```powershell
   openssl pkcs12 -export -out login.lktech.life.p12 -inkey .\lego-data\certificates\login.lktech.life.key -in .\lego-data\certificates\login.lktech.life.crt -certfile .\lego-data\certificates\login.lktech.life.issuer.crt
   ```

   Choose a strong export password. In WinBox, upload the `.p12` file to **Files**, then use **System → Certificates → Import** and enter the password locally.
4. In the MikroTik terminal, trust the imported leaf certificate and reapply the Hotspot profile:

   ```routeros
   /certificate print detail where common-name="login.lktech.life"
   /certificate set [find where common-name="login.lktech.life"] trusted=yes
   /tool fetch url="https://billing.lktech.life/hotspot/hotspot.rsc" dst-path=hotspot.rsc
   :delay 2s
   /import hotspot.rsc
   ```

   Confirm `/ip hotspot profile print detail where name="billing-hotspot-profile"` shows the certificate and `login-by=https,http-chap`. Then forget and rejoin the Wi-Fi on an Android phone so it obtains a fresh DHCP lease. RouterOS should advertise the captive portal and Android can show its sign-in prompt. A new certificate must be issued and imported before the current one expires; importing a renewed certificate and rerunning `hotspot.rsc` updates the profile.

Refresh the captive portal files on an existing router:

```routeros
/tool fetch url="https://billing.lktech.life/hotspot/hotspot-files.rsc" dst-path=hotspot-files.rsc; :delay 2s; /import hotspot-files.rsc
```

For a non-default workspace, include its slug in the bundle URL, for example `https://billing.lktech.life/hotspot/hotspot-files.rsc?tenant=acme-network`. The provisioning flow does this automatically. The router-delivered login page now opens `/hotspot`, the subscription experience where customers can choose hotspot Wi-Fi or home PPPoE plans. Hotspot purchases retain the workspace, client MAC, and router sign-in return URL; after checkout customers can return to enter their Wi-Fi credentials. Refresh the portal files on existing routers after each portal update. PPPoE signups also require the [PPPoE account migration and setup](./pppoe-mpesa-setup.md).

Standalone RouterOS scripts are available in [`public/routeros`](../public/routeros). The `lktech.rsc` bootstrap requires the one-time provisioning URL from the generated WinBox command; replace its placeholder before running it. It fetches the router-specific script without storing a token in this repository. The support scripts `certificates.rsc`, `config.rsc`, `hotspot-files.rsc`, and `hotspot.rsc` are tenant-neutral and mirror the default-workspace bundle. For another workspace, use the tenant-aware URL above or the guided provisioning flow.

Before production launch, confirm `billing.lktech.life` resolves to the Vercel project and that `/hotspot` and `/api/hotspot/packages` return successfully over HTTPS. Checkout remains unavailable until required database migrations, that workspace's live Daraja credentials, and router walled-garden access are all configured.

## Voucher expiry

Apply migration `20261006120000_add_voucher_expiry.sql` before using voucher expiry. Newly generated vouchers store their selected plan duration, but the validity countdown starts only when FreeRADIUS records the voucher's first accounting start. Ensure RADIUS accounting is enabled and writes start records to `radacct`; the migration uses those records to activate the voucher and set its absolute `Expiration` check item. If a username matches more than one unactivated voucher across workspaces, the migration intentionally skips activation rather than expiring the wrong account.

Enable the FreeRADIUS `expiration` module in the `authorize` section after SQL so expired vouchers are rejected. It also caps `Session-Timeout` to the remaining time after reconnects. Voucher screens display activation and expiry timestamps in East Africa Time; exports include plan validity and note that it begins at first connection. Existing vouchers without a stored duration remain untracked.

Router monitor scripts report metrics every minute. Router status remains online for up to 90 seconds after its last report, allowing for a missed interval or brief network interruption. The dashboard refreshes while visible, and telemetry history is retained for up to 35 days. To update a previously installed monitor to the current cadence, open the router's monitoring detail, choose **Install / reinstall RouterOS monitor**, and run the newly generated script in the MikroTik terminal; it replaces the previous monitor scheduler.
