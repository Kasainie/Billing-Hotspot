# LKTECH Hotspot Billing

## User and Operator Manual

**A beginner-friendly guide for ISP owners, workspace administrators, and support staff**

Edition 1

---

## Contents

1. What LKTECH does
2. Before you begin
3. Create your account and workspace
4. Find your way around the dashboard
5. Set up your network in the right order
6. Manage subscribers and plans
7. Configure your captive portal
8. Configure payments and reconcile transactions
9. Create and manage vouchers
10. Configure SMS and review delivery
11. Manage routers and live sessions
12. Reports, exports, and mobile access
13. Security and good operating practices
14. Troubleshooting guide
15. Platform and deployment notes
16. Glossary and further reading

---

## 1. What LKTECH does

LKTECH is a hosted billing and operations dashboard for internet service providers. An ISP workspace can manage subscribers, service plans, network sites, hotspot vouchers, payments, customer access, and supported MikroTik router workflows.

The application is hosted at **https://billing.lktech.life**. Customers use a captive portal to view packages and, where enabled, request paid or free hotspot access. Subscriber authentication is handled by FreeRADIUS and the router; LKTECH records and manages the related billing data.

### Two different experiences

- **ISP staff dashboard:** Sign in to manage your own ISP workspace.
- **Customer captive portal:** Visitors connect to a hotspot and use the portal to choose a package, pay, and sign in to the router.

The customer portal does not grant access to the staff dashboard. Each ISP workspace's business records are isolated from other workspaces.

### What you need to operate the service

LKTECH does not replace your internet uplink, Wi-Fi access points, or RADIUS infrastructure. A working service normally needs:

- A MikroTik router with a functioning WAN connection and RouterOS 7.1 or newer for guided provisioning.
- A reachable FreeRADIUS server configured as a RADIUS client on each router, using matching shared secrets.
- The application database and required migrations for the features you use.
- Your own merchant account and verified credentials before accepting live payments.
- A workspace slug or supported domain for identifying your customer portal.

The router must be able to reach RADIUS over the network or private VPN. A portal page can load while RADIUS is unreachable; in that case, authentication and activation can still fail.

## 2. Before you begin

Have the following information ready:

### For ISP staff

- Your ISP or business name, contact details, and support contact.
- A verified email address and a strong password.
- The name and location of your first network site.
- A list of router interfaces and a clear identification of the WAN/uplink port.
- Your hotspot or PPPoE plans, prices, durations, and service limits.
- Merchant credentials from Safaricom Daraja, Pesapal, or IntaSend if you intend to accept payments.
- Africa's Talking credentials if you intend to send SMS.

### For the network administrator

- Router administrator access through WinBox or the RouterOS terminal.
- The private/reachable address of the RADIUS server and its shared secret.
- Confirmation that routing, firewall rules, and UDP ports 1812 (authentication) and 1813 (accounting) allow the router-to-RADIUS traffic.
- A private hotspot subnet that does not overlap the WAN network.
- A backup of the current router configuration before changing bridges or services.

### Important preparation

1. Confirm which physical interface is WAN. Never guess based on port number.
2. Record the current bridge, DHCP, Hotspot, PPPoE, and firewall configuration.
3. Keep a separate way to manage the router if a bridge change interrupts the client network.
4. Start with one test router, one test customer, and sandbox payment credentials.
5. Do not put passwords, API keys, private keys, or shared secrets in screenshots, support messages, or exported reports.

## 3. Create your account and workspace

1. Open **https://billing.lktech.life/signup**.
2. Register using an email address you control and create a password that meets the on-screen requirements.
3. Enter the six-digit email verification code. It expires after 10 minutes. If needed, request a new code after the resend cooldown.
4. Sign in after verification. Google sign-in, if enabled for the deployment, can continue directly to setup.
5. Complete **Get started**: confirm your ISP name and portal identity, create your first network site, and follow the router setup steps when ready.
6. Open the dashboard and confirm the workspace name in the workspace switcher.

Email/password sign-in requires a verified email address. If you cannot receive verification or password-reset mail, contact the platform administrator; email delivery depends on the hosted service's mail configuration.

### Workspaces and roles

An ISP may have more than one workspace and can switch between workspaces where the account has membership. Workspace data is separate.

- **Owner and Admin:** Can create, update, and remove workspace records and change workspace settings.
- **Member:** Can view workspace data but cannot use tenant write APIs to make changes.
- **Platform administrator:** A separate, explicitly allowlisted role for platform-level operations. A tenant membership alone does not provide platform access.

If a page is unexpectedly read-only, check the role associated with the currently selected workspace.

## 4. Find your way around the dashboard

The left navigation is grouped by work area. Labels may vary slightly as the product evolves.

### Overview

Shows workspace activity and summary information. Use the report-format selector and **Export report** when you need a downloadable summary. Dashboard figures come from workspace records and may be unavailable while data is loading or if the database cannot be reached.

### Customers

- **Subscribers:** Create and maintain customer accounts, assign plans, review status, and open a subscriber profile.
- **Leads:** Track prospective customers.
- **Tickets:** Review support tickets and ticket analytics.

### Network

- **Live sessions:** Review active Hotspot/PPPoE sessions where data is available.
- **Plans:** Create the packages offered to customers.
- **Portal design:** Set the customer-facing captive portal name, welcome text, and support line.
- **Devices → Routers:** Register routers and use guided provisioning or monitoring workflows.
- **Devices → TR-069:** Open the TR-069 area. A working ACS/TR-069 integration is required for device management.

### Finance

- **Billing → Payments:** Review payment records.
- **Billing → Payment settings:** Configure Daraja credentials for this workspace.
- **Billing → SMS settings:** Configure Africa's Talking and view message delivery.
- **Billing → Invoices / Expenses:** Review invoice and expense records.
- **Vouchers → List / Generate / Analytics:** Manage prepaid access vouchers.

### Settings, search, and account menu

The profile menu provides account, settings, audit-log, and sign-out actions as available to your role. Settings include branding, workspace domain/slug, Hotspot and PPPoE defaults, provider setup, and account/security controls. Use dashboard search to locate pages and workspace records.

Changing a workspace slug affects customer-facing portal links. Update links or router configuration that rely on the old slug and test the portal after saving.

## 5. Set up your network in the right order

Follow this sequence to reduce avoidable service interruptions:

1. **Create a site.** Give it a clear name and location so routers and subscribers can be assigned to the right place.
2. **Prepare RADIUS.** Register each router as a RADIUS client, use the same shared secret on both sides, and confirm authentication and accounting are enabled.
3. **Create plans.** Decide which Hotspot or PPPoE products to sell and configure their duration, price, and limits.
4. **Configure a test router.** Back up its configuration and identify WAN, management LAN, and subscriber-facing interfaces.
5. **Configure the captive portal.** Set the workspace's branding and support contact, then refresh portal files on existing routers when required.
6. **Configure a payment provider** in sandbox and test the entire checkout-to-login flow.
7. **Test with a real client device.** Confirm package display, payment/free activation, RADIUS authentication, internet access, expiry, and support contact.
8. **Move to production** only after the complete test passes and the merchant account is approved.

### Router provisioning and port safety

The guided MikroTik wizard discovers router interfaces and generates RouterOS commands. Review the interface list and generated changes before running them.

- **WAN port:** Keep the uplink out of the billed subscriber bridge. The wizard protects interfaces marked as WAN; verify the identification yourself.
- **Selected subscriber ports:** These are moved to a dedicated billing bridge for Hotspot/PPPoE services only after confirmation.
- **Unselected ports:** Stay on the existing non-WAN LAN for ordinary, unbilled internet access.
- **Deselected ports:** Ports removed from the subscriber selection are returned to that regular LAN.
- **Management port:** Keep a reliable path to manage the router on the existing LAN.
- **Subnets:** Choose a private Hotspot subnet that does not overlap the router's WAN network. A subnet option adds a bridge gateway address; it does not automatically redesign all DHCP pools.

If the router does not have a separate non-WAN LAN bridge, configure one before expecting unselected ports to provide ordinary internet. Confirm that the WAN DHCP/PPPoE client and default route remain valid after any bridge changes.

### RADIUS and VPN connectivity

The router sends authentication and accounting to a RADIUS server. If the server uses a private address (for example `10.77.0.1`), that address must actually be reachable from the router over a configured route or private VPN. A private IP typed into a setting does not create VPN connectivity by itself.

WireGuard is one possible encrypted private tunnel between the router and a server/network. Each router needs its own peer configuration, allowed IPs/routes, and firewall rules. Do not expose RADIUS or router management to the public internet as a shortcut.

### RouterOS version and generated scripts

Guided provisioning requires RouterOS 7.1 or newer. The generated setup link is time-limited; follow the wizard's current instructions and generate a fresh command if it expires. Paste commands only into the intended router and verify the router identity before applying them.

If the terminal reports `bad parameter mac-cookie-timeout`, update/re-fetch the current managed Hotspot script and rerun the relevant setup step. RouterOS uses a default MAC-cookie timeout; the setting is not required to use the managed profile.

### HTTPS certificate on a MikroTik captive portal

HTTPS on a router requires the certificate **and its matching private key**. The provisioning script does not distribute a shared private key to tenants. Certificate installation is a separate per-router administrator task; follow the detailed certificate procedure in [Hotspot M-Pesa Checkout](./hotspot-mpesa-setup.md#android-automatic-sign-in). Never upload a private key to the application or share it between customers/tenants.

The router can use HTTP-CHAP when HTTPS certificate prerequisites are not met. Android's automatic captive-portal discovery requires a trusted certificate for the advertised portal hostname.

## 6. Manage subscribers and plans

### Create a plan first

Open **Network → Plans** and create the product before assigning it to a subscriber. Enter a recognizable name, access type, price, validity period, and any applicable speed or data settings. Verify that the plan is active/listed where it should appear in the customer purchase flow.

Some advanced settings have prerequisites. For example, Fair Usage Policy (FUP) throttling requires the relevant database migration and RADIUS accounting. FUP changes a user's rate after the configured usage threshold; it is not a hard disconnect.

### Add a subscriber

1. Open **Customers → Subscribers** and choose **Add subscriber**.
2. Enter the customer's name and contact information.
3. Choose the correct network site and plan.
4. Set the RADIUS username and password as required by the form and your authentication policy.
5. Save and review the subscriber profile and status.

New subscriber accounts are created suspended. Confirm the service, plan, payment, and intended activation state before enabling access. The RADIUS system must be configured to read the application's subscriber credentials for login to work.

### Import subscribers from CSV

The import accepts CSV files smaller than 2 MB and up to 200 records per import. Required headers include **Name, Email, Plan or Plan ID, RADIUS Username, and RADIUS Password**. Location and Network Site are optional. Review the import help text in the dashboard for the exact current header names and password requirements.

Imports create suspended accounts. Validate the records and activate accounts only when appropriate. Exported subscriber CSVs leave passwords blank for security; do not treat an export as a password backup.

### Subscriber status and expiry

A customer may have a valid record in LKTECH but still fail to sign in if the RADIUS server is unreachable, the router is not registered as a RADIUS client, the shared secret differs, or the RADIUS SQL/expiration configuration is incomplete. Check both the subscriber record and the network authentication path.

## 7. Configure your captive portal

1. Open **Network → Portal design** or the Branding/Hotspot section of **Settings**.
2. Set the ISP name, welcome headline/message, and support contact.
3. Save and preview the customer-facing portal.
4. Confirm the router portal files are current. Existing routers may need a portal-file refresh after portal changes.
5. Ensure the workspace slug is correct and the router's portal URL includes the right workspace.

The guided provisioning flow sets up the managed portal files and URL. For non-default workspaces, use the tenant-aware link generated by the flow; manually assembled URLs must preserve the correct workspace identifier.

### Customer purchase and sign-in flow

1. The customer joins the Wi-Fi network and opens the captive portal.
2. They select an available Hotspot package.
3. For paid packages, they complete payment using the configured provider. For a free package, activation may be automatic.
4. The portal displays or forwards the issued credentials to the router sign-in form.
5. The router requests RADIUS authentication and accounting.
6. After successful authentication, the customer receives the access permitted by the package and its expiry/limits.

An on-screen message such as "Signing you in now..." followed by a reload is not proof of successful activation. Verify the router's RADIUS reachability and logs, the user's RADIUS entries, and active session status.

### Captive portal tips

- If the sign-in window does not open automatically, reconnect to Wi-Fi and visit `http://neverssl.com` in a browser to trigger the HTTP redirect.
- Do not expect HTTPS requests to be transparently redirected by a router.
- The router walled garden must allow the billing portal before login.
- Captive clients should use the router's Hotspot gateway for DNS so captive checks can be intercepted.
- A private/randomized Wi-Fi MAC address can change the identity the portal associates with the device.

## 8. Configure payments and reconcile transactions

### Daraja / M-Pesa

Open **Billing → Payment settings** and choose sandbox first. Enter this workspace's shortcode, consumer key, consumer secret, passkey, and HTTPS callback URL. Credentials are saved securely and are not shown again after saving. Do not use one workspace's merchant credentials for another ISP unless the merchant account is intentionally shared and authorized.

The callback URL must point to the application's Daraja callback endpoint. Safaricom STK Push asks the customer to enter their PIN in Safaricom's phone prompt; the PIN is never entered in LKTECH.

Test a package from start to finish: request the payment, approve it on the phone, wait for server-side confirmation, verify the payment and subscriber/RADIUS access, and test router sign-in. A browser redirect or customer screenshot alone does not prove payment.

Direct PayBill C2B payments require the relevant callback configuration and a registered Safaricom integration. Confirm the workspace-specific validation and confirmation URLs in payment settings and configure them at Safaricom when using that flow.

### Pesapal and IntaSend

If enabled in the deployment, these providers are configured from **Settings → Payments**. Follow the workspace settings and provider documentation. Start in sandbox and test status confirmation before production.

Payment notifications are not by themselves proof of payment. The application verifies provider status, amount, currency, and reference before fulfilling an order. Airtel Money is not available unless a supported integration is added to the deployment.

### Review payments

Open **Billing → Payments** to review recorded transactions. Use the payment reconciliation workflow when matching incoming payment records to customer activity. Investigate pending/failed items with the provider's transaction reference and timestamps. Do not grant service solely because a customer presents a payment screenshot.

M-Pesa customer checkout and PPPoE signup are separate supported flows. Manual PayBill transfers are not automatically reconciled as PPPoE signup purchases unless the supported C2B flow is configured.

## 9. Create and manage vouchers

1. Open **Vouchers → Generate**.
2. Select the intended plan and set the batch quantity/options provided by the form.
3. Generate and review the result.
4. Distribute voucher credentials privately and keep a record of which batch was issued.
5. Use **Vouchers → List** to review records and **Analytics** for usage summaries.

Where expiry tracking is enabled, a voucher's duration starts at its first recorded RADIUS accounting start, not necessarily when it was generated. This depends on the required database migration, RADIUS accounting, and FreeRADIUS expiration module. Older vouchers without a stored duration may not have tracked expiry.

Treat voucher usernames/passwords like cash: limit access, avoid public posting, and use the correct tenant/workspace when generating batches.

## 10. Configure SMS and review delivery

Open **Billing → SMS settings** and configure the workspace's Africa's Talking environment, application username, API key, and optional approved sender ID. Credentials and queued message contents are encrypted server-side. Use the test-message control with a number you control before enabling customer messaging.

The SMS panel shows queued, provider-accepted, delivered, and failed statuses when the required delivery-report setup is in place. A provider accepting a message is not the same as the handset confirming delivery. Review the delivery report and any failure detail before resending.

Automatic queue processing and delivery callbacks depend on deployment configuration, required database migrations, cron scheduling, and server secrets. If the message queue does not progress, ask the platform administrator to verify these services. Use the resend control for an individual failed message only after checking the recipient number and provider status; a resend may result in a second message.

SMS can incur provider charges. Obtain the necessary customer consent and follow local messaging requirements.

## 11. Manage routers and live sessions

### Router inventory and monitoring

Open **Network → Devices → Routers** and select a site/router. The guided setup is used to prepare provisioning scripts. Router monitoring is a separate optional setup and must be installed on each router.

The monitoring script can report CPU, memory, disk, traffic counters, uptime, RouterOS version, and Hotspot/PPPoE counts. When configured, the dashboard considers a router offline after 90 seconds without a report and retains metric history for up to 35 days. Monitoring reports do not configure or repair the router's WAN uplink.

### Live sessions and remote actions

The **Live sessions** page displays available session data. Per-user live RouterOS session details and remote disconnect commands require the optional router API connector, its database migration, a running connector host, and secure network connectivity to the router. Without that connector, the application may show only available RADIUS records or snapshots; do not assume snapshot data is live.

Never expose RouterOS management directly to the public internet. Use a private VPN for an off-site connector host and restrict its access.

### TR-069

The dashboard has a TR-069 area, but router provisioning and monitoring do not automatically create a TR-069 ACS deployment. Confirm that your deployment has a compatible ACS and its required configuration before relying on TR-069 device management.

## 12. Reports, exports, and mobile access

Where an export selector is shown, choose the available format (CSV, Excel, or PDF) and use the page's export action. Export only the records needed for the task and store downloaded files securely. Passwords are intentionally omitted from subscriber exports.

The dashboard is designed for desktop and mobile web use. If using the Android or Windows app, it opens the hosted LKTECH service and requires internet access; it does not host the billing backend locally. Installers and current platform notes are linked from **https://billing.lktech.life/downloads**.

Some desktop installers are unsigned and may trigger a Windows SmartScreen warning. Only install software obtained from the official LKTECH download page or an administrator-approved distribution.

## 13. Security and good operating practices

- Use a unique, strong password and sign out on shared devices.
- Give staff only the workspace membership and role they need.
- Keep payment provider keys, SMS API keys, RADIUS secrets, router tokens, and certificate private keys secret.
- Never put secrets in browser-side code, public links, screenshots, support tickets, or CSV exports.
- Confirm the selected workspace before creating or changing customers, plans, payments, or vouchers.
- Use sandbox mode for testing and switch to production only after end-to-end validation.
- Back up router configuration before changing ports, bridges, DHCP, Hotspot, or firewall rules.
- Keep RADIUS and router-management traffic on trusted/private network paths and use firewall allowlists.
- Review payment references against provider-side status; do not trust redirects or screenshots as settlement evidence.
- Confirm the customer, package, and amount before manually changing account status.
- Protect downloaded customer lists, payment records, and voucher batches; delete local copies when no longer needed.
- Ask the platform operator before changing production secrets or database migrations.

The deployment encrypts workspace provider credentials when `TENANT_SECRETS_ENCRYPTION_KEY` is configured. This is a server-side deployment secret; workspace owners should not change it. Replacing it without migrating encrypted data can make existing credentials unreadable.

## 14. Troubleshooting guide

### Customer sees "Signing you in now..." repeatedly

1. Check **Billing → Payments** and confirm the transaction was server-confirmed, not just redirected in the browser.
2. Check that the customer is active and has the expected RADIUS username/password and valid plan/expiry.
3. From RouterOS, inspect `/radius print detail` and `/radius monitor`. Confirm the server address and shared secret match the registered RADIUS client.
4. Test whether the router can reach the RADIUS host over the configured route/VPN. A private address such as `10.77.0.1` will not work without a route to that network.
5. Check Hotspot logs and RADIUS logs for timeouts, rejects, or authentication errors.
6. Verify FreeRADIUS SQL reads the right workspace records and its expiration module is enabled where required.
7. Confirm that the router Hotspot walled garden allows the billing portal and that the portal carries the right tenant slug.

Timeouts with no accept/reject usually indicate reachability or firewall/secret configuration, not a portal reload defect.

### Router shows RADIUS server not responding

- Confirm the server is running and listening on UDP 1812/1813.
- Verify the router has a valid route to the RADIUS address and that the private VPN peer is configured and active, if used.
- Check firewall rules at both ends and allow only the required router source/network.
- Confirm the router is registered as a RADIUS client and the shared secret matches exactly.
- Verify the RADIUS server has the correct client IP (often the router's VPN/source address, not its LAN address).
- Check router time, server logs, and any NAT between the router and RADIUS server.

### Router clients have no internet after provisioning

- Confirm the WAN cable is connected to the identified WAN port.
- Check that WAN DHCP or PPPoE is still running and that the router has a default route.
- Ensure the WAN interface is not in the billing subscriber bridge.
- Confirm subscriber ports are selected intentionally and unselected ports remain on the non-WAN LAN bridge.
- Check that the LAN DHCP server and address pool match the intended bridge/subnet.
- Verify NAT/firewall rules and upstream connectivity.
- If the router has no non-WAN LAN bridge, configure one before expecting unselected ports to work as ordinary unbilled LAN ports.
- Restore the router backup or use local management access if the bridge changes disconnect you.

### Hotspot login page does not open

- Forget/rejoin the Wi-Fi network or renew the device's DHCP lease.
- Visit `http://neverssl.com` to trigger captive HTTP redirection.
- Confirm the device receives the router Hotspot gateway as DNS.
- Check that router Hotspot files were refreshed and the billing hostname is in the walled garden.
- Confirm the portal URL contains the correct workspace slug.
- Check the router's Hotspot profile and DNS configuration. HTTPS redirection will not behave like HTTP captive redirection.

### Android does not show an automatic sign-in prompt

- Automatic captive-portal discovery requires RouterOS support and a trusted certificate for the exact advertised hostname.
- Confirm the certificate and matching private key were imported directly to the router and the leaf certificate is trusted.
- Confirm the Hotspot profile references the correct certificate and HTTPS login mode.
- If there are multiple certificates with the same common name, follow the certificate replacement steps in the detailed setup guide.
- Rejoin the Wi-Fi network to obtain a fresh DHCP lease.
- Do not share the certificate's private key with another ISP or upload it to LKTECH.

### A package or free offer is missing from the portal

- Check that the plan is active/listed and belongs to the correct workspace.
- Check that the portal is using the expected workspace slug.
- Confirm the plan is the right service type and has a valid price/duration.
- Refresh the router portal files if it is using old files.
- Confirm the public portal endpoint is reachable over HTTPS.

### Payment remains pending or fails

- Confirm the workspace selected the correct sandbox/production environment and saved its own merchant credentials.
- Check shortcode, passkey, callback URL, and provider-side app approval.
- Verify callback/webhook URLs and any required provider registration.
- Check the provider transaction status using its reference; do not rely only on the browser return page.
- Ask the platform administrator to check server logs and database migrations if provider confirmation is missing.
- Do not retry repeatedly without checking whether the original transaction was charged.

### SMS is queued, pending, or failed

- Confirm the workspace's Africa's Talking environment, username, API key, and sender ID.
- Send a test SMS to a controlled number.
- Review the message's delivery status and provider error.
- Ask the platform administrator to verify the SMS cron, callback secret, callback URL, and required migrations.
- Check that the recipient number is correctly formatted and permitted by the provider.
- Before resending, check whether the provider already accepted or delivered the prior attempt.

### Router appears offline in monitoring

- Check that the router has power and the WAN has internet access.
- Confirm the monitoring script/scheduler remains installed and enabled.
- Confirm outbound HTTPS from the router to the application is permitted.
- Check whether the server's monitor token is current; regenerate and reinstall the script if rotated.
- Allow for the monitoring interval and offline threshold; a brief missed report may not immediately mean failure.
- Monitoring does not repair the router's DHCP/PPPoE uplink.

### Live sessions or remote disconnect are unavailable

- Confirm that the optional connector migration is applied and the connector service is running.
- Check private network/VPN reachability from the connector host to the router.
- Confirm the router API is enabled and restricted to trusted sources.
- Review whether the page is displaying a snapshot rather than live session data.
- Remote actions require the connector to be online; router monitoring alone is not enough.

### Cannot sign in, switch workspaces, or edit a record

- Confirm the email address is verified and use password reset if required.
- Check whether the account is a member of the selected workspace.
- Check the member's role: Members are read-only; Owners/Admins can make changes.
- If the workspace is suspended or an account is locked out, contact the platform administrator.
- Clear a stale browser session by signing out and signing back in; avoid sharing session cookies.

### Router script reports `bad parameter mac-cookie-timeout`

Fetch the current managed RouterOS scripts and rerun the relevant setup. Do not add the unsupported setting manually. The managed Hotspot profile relies on RouterOS's default MAC-cookie timeout.

## 15. Platform and deployment notes

This section is for the person hosting and maintaining LKTECH, not everyday ISP staff.

- The web application uses Next.js and a PostgreSQL database hosted through Supabase in this deployment.
- Database schema changes are delivered as SQL migrations under `supabase/migrations`. Apply the required migrations before deploying code that depends on them.
- Keep `DATABASE_URL`, `TENANT_SECRETS_ENCRYPTION_KEY`, provisioning secrets, RADIUS secrets, mail credentials, and cron secrets server-side only.
- Apply the multitenancy migration before operating separate ISP workspaces.
- Signup verification and password-reset mail depend on the configured email provider.
- Daraja, SMS, gateway, router-monitoring, router-connector, voucher-expiry, and advanced settings each have specific prerequisites. Consult the detailed documentation before enabling them.
- The optional SMS queue requires a scheduled job and callback configuration. Router monitoring and the router API connector are separate systems.
- Settings for SMTP, WhatsApp, AI, accounting, loyalty, operator alerts, developer webhooks, and message templates may be saved as preferences without an active external integration. Do not promise that saved preference fields send messages or trigger automation unless the integration is implemented and verified.
- Custom workspace domains require DNS and TLS configuration at the hosting provider; changing a workspace slug alone does not create a custom domain.
- Backups, retention, monitoring, incident response, and production deployment are responsibilities of the platform operator. ISP workspace users should contact their platform administrator rather than applying production migrations themselves.

## 16. Glossary and further reading

- **Workspace / tenant:** The isolated account space belonging to an ISP.
- **RADIUS:** Network authentication, authorization, and accounting service used by routers.
- **FreeRADIUS:** The RADIUS server implementation used by this deployment.
- **Hotspot:** Captive-portal Wi-Fi service where a user signs in through a router web page.
- **PPPoE:** Point-to-Point Protocol over Ethernet, commonly used for fixed/home subscriber connections.
- **Voucher:** Prepaid credentials that grant access when used, often with a validity duration.
- **Walled garden:** Router rules that allow a limited set of destinations before a user signs in.
- **WireGuard:** An encrypted VPN protocol that can provide private connectivity between routers and services.
- **WAN:** The router's upstream internet connection.
- **FUP:** Fair Usage Policy; this deployment can throttle a user after a configured usage threshold when prerequisites are enabled.
- **Daraja:** Safaricom's M-Pesa integration platform.
- **SMS delivery report:** Provider feedback about whether a message was delivered, distinct from the initial API acceptance.

### Detailed project documents

- [ISP workspaces and tenant setup](./multitenancy.md)
- [Hotspot M-Pesa Checkout](./hotspot-mpesa-setup.md)
- [PPPoE M-Pesa Signup](./pppoe-mpesa-setup.md)
- [Workspace payment gateways](./payment-gateways.md)
- [LKTECH desktop and Android apps](./standalone-apps.md)
- [Application README](../README.md)

---

**LKTECH | Hotspot Billing**  
Keep this guide with your operational records. Review provider, router, and deployment-specific requirements with your network or platform administrator before changing a live service.
