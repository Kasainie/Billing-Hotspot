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

Apply `20261010120000_add_hotspot_fup_throttling.sql` before deploying package FUP settings. In **Network → Packages**, enable FUP, set the per-purchase data limit, and enter the throttled upload and download rates. MikroTik accounting on `radacct` tracks usage; once it reaches the limit, the subscriber's RADIUS rate limit is changed to those rates on their next login or reconnect. Usage starts at the purchase time (or voucher activation) and resets with the next purchase. This is a throttle, not a hard disconnect; RADIUS accounting must be enabled on each router.

## Multi-location Hotspot

All owned MikroTik access points must use the same RADIUS server and shared database. Each router must also be registered as a RADIUS client. The portal remembers a device by the MAC address MikroTik supplies; using the same SSID at each location helps devices keep the same private MAC address.

Generated Hotspot and PPPoE configurations report RADIUS accounting every minute. Re-run the router service configuration to apply the new interval to routers provisioned previously.

Live session status expires when a router has not sent an accounting update for three minutes, so sessions left open after a router outage are no longer reported as online. This allows two missed one-minute updates before treating a session as stale.

Free, zero-cost hotspot packages activate automatically when a visitor selects them. The portal uses MikroTik's client MAC and submits the issued RADIUS credentials in plain form only over HTTPS. If an HTTPS portal is given an HTTP login action, it upgrades that action to HTTPS; on HTTP it uses CHAP when the router supplies a challenge and refuses an insecure plain-password submission. Managed Hotspot profiles also enable RouterOS MAC-cookie authentication with a three-day cookie lifetime. After a successful sign-in, the same device can reconnect without opening the captive portal while its RADIUS account remains valid. The account's RADIUS expiration still limits the package; private/randomized MAC changes may require signing in through the portal again. Re-run the router service configuration on existing routers to apply MAC-cookie settings.

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

Router service setup isolates billed subscriber ports on a dedicated Hotspot/PPPoE bridge. The existing non-WAN LAN bridge remains the normal, unbilled network: unchecked ports stay there, and a port selected for subscribers moves only after the admin confirms the move. Ports that are later unchecked are returned to that LAN bridge. Confirm the physical WAN port before applying service changes.

New Hotspot configuration scripts add `billing.lktech.life` to the MikroTik Hotspot walled garden. For routers already configured, add this once from RouterOS:

```routeros
:if ([:len [/ip hotspot walled-garden find where dst-host="billing.lktech.life" and action="allow"]] = 0) do={/ip hotspot walled-garden add dst-host="billing.lktech.life" action=allow comment="billing-system-managed-portal"}
```

The managed Hotspot profile sets `dns-name="login.lktech.life"` so RouterOS can resolve the captive login host locally. To update an existing router immediately, run:

```routeros
/ip hotspot profile set [find where name="billing-hotspot-profile"] dns-name="login.lktech.life"
```

Hotspot clients must use the MikroTik Hotspot gateway as their DNS server so captive-network checks on laptops and other clients are intercepted and redirected to the portal. Managed service provisioning configures this automatically and enables RouterOS DNS requests for hotspot clients. On existing routers, run the refreshed `hotspot.rsc` script, or set the matching DHCP network's `dns-server` to its gateway and enable `/ip dns set allow-remote-requests=yes`; then reconnect clients or renew their DHCP leases. Keep the router's input firewall blocking DNS requests from the WAN.

The portal bundle includes `redirect.html` to return an HTTP 302 with the captive login URL; Windows NCSI and other captive-network checks rely on a real redirect response. If a laptop does not open its sign-in window automatically, connect to the hotspot and visit `http://neverssl.com` in a browser. This triggers the HTTP captive redirect without using HTTPS, which routers cannot transparently redirect. After deploying portal-file changes, refresh the router's hotspot files and renew the laptop's Wi-Fi connection.

The router service wizard isolates checked subscriber ports on a dedicated bridge for Hotspot/PPPoE services. The existing non-WAN LAN bridge remains the regular unbilled network. Unchecked ports stay on that LAN bridge, and ports deselected after a previous setup return there. Selected ports move only after explicit admin confirmation; marked WAN ports are never moved. If no existing non-WAN LAN bridge is detected, configure one before expecting unselected ports to have ordinary internet access.

### Android automatic sign-in

RouterOS can advertise captive-portal discovery to clients using DHCP (RFC 7710/8910). Android requires the advertised portal hostname to present a trusted TLS certificate. The managed router profile enables HTTPS login and selects the certificate only when it finds exactly one trusted certificate whose common name is `login.lktech.life`; without it, provisioning retains HTTP-CHAP and prints a warning rather than configuring a broken HTTPS endpoint.

The provisioning scripts do not download or distribute a shared TLS private key. Import a certificate and matching private key on each router using the steps below, trust the imported certificate, and rerun `hotspot.rsc`; the certificate and key must be present locally for RouterOS to serve HTTPS.

The public DNS records for `login.lktech.life` currently point to Vercel, not the router, so RouterOS's inbound HTTP ACME challenge cannot issue this certificate. Use DNS-01 instead; it validates a temporary TXT record and does not require changing the A records or exposing router management/HTTP to the internet:

1. Download the Windows `lego` release from [go-acme/lego](https://github.com/go-acme/lego/releases). Create a Vercel API token with permission to manage DNS records for the `lktech.life` zone. Keep the token private; do not paste it into chat or commit it.
2. In PowerShell in the folder containing `lego.exe`, enter the token through the hidden prompt and request the certificate:

   ```powershell
   $secureToken = Read-Host "Vercel DNS API token" -AsSecureString
   $env:VERCEL_API_TOKEN = [System.Net.NetworkCredential]::new("", $secureToken).Password
   .\lego.exe --path .\lego-data-rsa --email "YOUR_EMAIL" --dns vercel --domains login.lktech.life --key-type rsa2048 run
   Remove-Item Env:VERCEL_API_TOKEN
   ```

   The certificate and key are written under `lego-data-rsa\certificates`. RSA issuance selects Let's Encrypt's YR intermediate chain, whose default path is cross-signed by the widely trusted ISRG Root X1. This is preferable for captive-portal clients that may not trust newer root chains. Keep the separate path when replacing a certificate so the currently installed certificate remains available until the replacement is tested. Do not share or upload the private key anywhere except directly to the router.
3. Use OpenSSL to package the certificate, private key, and issuer chain as a password-protected PKCS#12 file:

   ```powershell
   openssl pkcs12 -export -out login.lktech.life-rsa.p12 -inkey .\lego-data-rsa\certificates\login.lktech.life.key -in .\lego-data-rsa\certificates\login.lktech.life.crt -certfile .\lego-data-rsa\certificates\login.lktech.life.issuer.crt
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

   For a first installation, confirm `/ip hotspot profile print detail where name="billing-hotspot-profile"` shows the certificate and `login-by=https,http-chap,mac-cookie`. RouterOS uses its default 3-day MAC-cookie timeout. When replacing a certificate, note the exact name of the newly imported leaf certificate and update the profile to use it:

   ```routeros
   /ip hotspot profile set [find where name="billing-hotspot-profile"] ssl-certificate="NEW_IMPORTED_LEAF_CERTIFICATE" login-by=https,http-chap,mac-cookie
   ```

   Do not rerun `hotspot.rsc` while both the old and new trusted leaf certificates have `common-name="login.lktech.life"`; that script expects exactly one matching certificate and otherwise falls back to HTTP. Confirm the profile points to the new certificate before removing the old leaf. Then forget and rejoin the Wi-Fi on an Android phone so it obtains a fresh DHCP lease. RouterOS should advertise the captive portal and Android can show its sign-in prompt. Renew and import a compatible certificate before the current one expires.

Refresh the captive portal files on an existing router:

```routeros
:if ([:len [/file find where name="hotspot-files.rsc"]] > 0) do={/file remove [find where name="hotspot-files.rsc"]}
/tool fetch url="https://billing.lktech.life/hotspot/hotspot-files.rsc" dst-path=hotspot-files.rsc; :delay 2s; /import hotspot-files.rsc
```

For a non-default workspace, include its slug in the bundle URL, for example `https://billing.lktech.life/hotspot/hotspot-files.rsc?tenant=acme-network`. The bundle replaces only its managed portal files (`login.html`, `status.html`, `logout.html`, `error.html`, `alogin.html`, `api.json`, `style.css`, and `md5.js`) before downloading the current versions; unrelated files in the Hotspot folder are left untouched. The provisioning flow does this automatically. The router-delivered login page now opens `/hotspot`, the subscription experience where customers can choose hotspot Wi-Fi or home PPPoE plans. Hotspot purchases retain the workspace, client MAC, and router sign-in return URL; after checkout customers can return to enter their Wi-Fi credentials. Refresh the portal files on existing routers after each portal update. PPPoE signups also require the [PPPoE account migration and setup](./pppoe-mpesa-setup.md).

Standalone RouterOS scripts are available in [`public/routeros`](../public/routeros). The `lktech.rsc` bootstrap requires the one-time provisioning URL from the generated WinBox command; replace its placeholder before running it. It fetches the router-specific script without storing a token in this repository. The support scripts `certificates.rsc`, `config.rsc`, `hotspot-files.rsc`, and `hotspot.rsc` are tenant-neutral and mirror the default-workspace bundle. For another workspace, use the tenant-aware URL above or the guided provisioning flow.

Before production launch, confirm `billing.lktech.life` resolves to the Vercel project and that `/hotspot` and `/api/hotspot/packages` return successfully over HTTPS. Checkout remains unavailable until required database migrations, that workspace's live Daraja credentials, and router walled-garden access are all configured.

## Voucher expiry

Apply migration `20261006120000_add_voucher_expiry.sql` before using voucher expiry. Newly generated vouchers store their selected plan duration, but the validity countdown starts only when FreeRADIUS records the voucher's first accounting start. Ensure RADIUS accounting is enabled and writes start records to `radacct`; the migration uses those records to activate the voucher and set its absolute `Expiration` check item. If a username matches more than one unactivated voucher across workspaces, the migration intentionally skips activation rather than expiring the wrong account.

Enable the FreeRADIUS `expiration` module in the `authorize` section after SQL so expired vouchers are rejected. It also caps `Session-Timeout` to the remaining time after reconnects. Voucher screens display activation and expiry timestamps in East Africa Time; exports include plan validity and note that it begins at first connection. Existing vouchers without a stored duration remain untracked.

Router monitor scripts start automatically after reboot, wait briefly for the router to initialize, and report metrics every 30 seconds. Router status remains online for up to 90 seconds after its last report, allowing for a missed interval or brief network interruption. After a power outage, the router can report online once power and its configured internet uplink return. The dashboard refreshes while visible, and telemetry history is retained for up to 35 days. The monitoring script does not configure the ISP uplink; check that the router's existing DHCP or PPPoE client reconnects automatically if the router remains offline. To update a previously installed monitor to this reboot recovery cadence, open the router's monitoring detail, choose **Install / reinstall RouterOS monitor**, and run the newly generated script in the MikroTik terminal; it replaces the previous monitor scheduler.
