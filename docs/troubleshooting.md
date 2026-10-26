# LKTECH Quick Troubleshooting Guide

**For ISP staff, network administrators, and hotspot customers**

Use this guide to identify the problem and choose a safe next step. Menu names can vary slightly by deployment. For complete setup and operating instructions, see the [LKTECH User and Operator Manual](./user-manual.md).

## Before you start

- Check whether the problem affects one person, one router/site, or everyone. This helps identify where the fault may be.
- Note when it started and whether anything changed just before it started.
- Do not share passwords, verification codes, M-Pesa PINs, API keys, RADIUS secrets, router tokens, or certificate private keys.
- Do not repeatedly retry a payment. Check its status first to avoid paying twice.
- If you are not responsible for router administration, do not change router settings or restart network equipment. Contact your ISP support person.

## Fast triage

Start with the scope before changing anything:

| What is affected? | First place to check | Likely owner |
| --- | --- | --- |
| One customer's device | Wi-Fi connection, account status, package, and expiry | Customer, then ISP staff |
| Several customers at one site | Router WAN, Hotspot, RADIUS reachability, and site monitoring | Network administrator |
| Customers at several sites | Application status, shared RADIUS/database services, and provider callbacks | Platform administrator |
| One payment or message | Transaction/message status and provider reference | ISP Owner/Admin |
| Staff dashboard access | Email verification, membership, selected workspace, and role | ISP Owner/Admin, then platform administrator |

Treat this as a starting point, not a diagnosis. A shared service can cause a site-wide issue, and a local device problem can look like an outage to one customer.

## Incident priorities

- **Critical:** multiple sites are down, customers may be charged twice, payment/account records appear incorrect, or a credential may be exposed. Notify the ISP and platform administrators promptly. Stop repeated payment attempts. Do not post or forward credentials or customer exports.
- **High:** one site is down, many customers cannot authenticate, or a payment provider confirms a charge that LKTECH does not show. Contact the responsible administrator and include timestamps and references through an approved support channel.
- **Routine:** one customer's sign-in, a single failed message, or a non-urgent dashboard issue. Collect the details below and contact the normal ISP support channel.

These labels help prioritize work; they are not a guaranteed response-time commitment.

## Safe incident workflow

1. **Record the impact.** Note when the issue started, the affected workspace/site, how many people are affected, and the last time the service worked.
2. **Check recent changes.** Ask whether a router, plan, provider credential, workspace setting, or deployment was changed. Do not assume the last change caused the problem, but include it in the incident notes.
3. **Use read-only checks first.** Review dashboard status, payment/message records, router monitoring, and relevant logs before changing settings or restarting equipment.
4. **Change one thing at a time.** A qualified administrator should make the smallest reversible change, record what changed, and preserve a router backup before network configuration changes.
5. **Verify the full customer path.** Confirm portal access, authentication, expected service/expiry, and (for paid purchases) server-confirmed payment status. A successful page load alone does not confirm end-to-end service.
6. **Escalate with evidence.** Share timestamps, exact error text, scope, and non-secret transaction references with the appropriate administrator. Never include passwords, PINs, API keys, shared secrets, tokens, private keys, or session cookies.

## Operator runbooks

### Many customers cannot authenticate

1. Confirm the scope: one device, one router/site, or multiple sites.
2. Check whether the router has WAN connectivity and whether its monitoring report is recent.
3. Ask the network administrator to verify the router's RADIUS destination, route/VPN, firewall path, and shared-secret match.
4. Review RADIUS logs for timeouts versus rejects. A timeout usually points to reachability or firewall issues; a reject means the server responded and the account or policy needs inspection.
5. Check that the subscriber is active, the correct workspace and plan are selected, and expiry has not passed.
6. After a fix, test with one authorized account before asking customers to retry.

Do not reset all subscriber passwords, expose RADIUS to the public internet, or re-provision a router as a first response.

### A payment is charged but access was not activated

1. Do not initiate another charge or manually activate the account yet.
2. Record the provider transaction reference, amount, currency, and timestamp. Share these only through the approved support channel.
3. An ISP Owner/Admin should compare **Billing → Payments** with the provider's transaction status and confirm the correct workspace and product.
4. If the provider confirms payment but LKTECH has no confirmed transaction, the platform administrator should inspect callback delivery and server logs.
5. Once payment is confirmed, verify that the account/package was fulfilled and then test router authentication.

Never use a screenshot or browser return page as proof of settlement. Avoid repeated payment attempts while the first status is unresolved.

### A router shows offline

1. Ask whether customers at the site still have internet; dashboard monitoring can be stale while service is working.
2. Confirm power and the existing WAN uplink without changing bridge or firewall settings.
3. Allow for the monitoring interval and 90-second offline threshold.
4. If still offline, have the network administrator check the monitor scheduler, outbound HTTPS, and current monitor token.
5. Use the optional router API connector only for live per-user sessions or remote actions; monitoring and the connector are separate services.

Do not factory-reset the router or open its management interface to the public internet to restore monitoring.

### The SMS queue is not progressing

1. Check whether one message or the whole queue is affected.
2. Review message status and provider error detail before resending.
3. Ask the platform administrator to verify scheduled queue processing, callback configuration, and required database migrations.
4. Confirm the recipient format and provider account state.
5. Resend only after confirming the provider did not already deliver the message; duplicate delivery is possible.

## Common problems

### I cannot sign in to the staff dashboard

1. Open the LKTECH dashboard address supplied by your ISP. The customer Wi-Fi portal is a different page.
2. Check that you entered the email address used for your staff account and that the account's email has been verified.
3. Use **Forgot password** if you do not remember the password. Check your spam folder for the reset message.
4. If you can sign in but cannot edit records, confirm that you selected the correct workspace. Members can view records; Owners and Admins can make changes.
5. If the reset or verification email never arrives, ask your platform administrator to check email delivery.

### The Wi-Fi sign-in page does not appear

1. Confirm you joined the correct Wi-Fi network, then disconnect and reconnect.
2. Open a browser and visit `http://neverssl.com` to prompt the router to open the sign-in page. Use an HTTP address; HTTPS pages cannot be reliably redirected by a captive portal.
3. If only your device is affected, forget the Wi-Fi network, reconnect, and try again.
4. If several customers are affected, contact the network administrator. The router's Hotspot, DNS, portal address, or internet connection may need attention.

### I see "Signing you in now..." but never get online

1. Wait briefly, then check whether the Wi-Fi shows connected and try opening a simple website.
2. If you paid, ask staff to confirm the payment is marked successful in **Billing → Payments**. A return to the portal or a payment screenshot is not confirmation.
3. Ask staff to check that your account is active and that the correct package and expiry are shown.
4. If payment and account details are correct, the network administrator should check the router's connection to RADIUS and review the router and RADIUS logs.

Do not send your password or M-Pesa PIN to support. Share a payment reference only through the support channel approved by your ISP.

### A package is missing from the Wi-Fi portal

Ask ISP staff to confirm that the package is active, listed for Hotspot use, and belongs to the correct workspace. If the package was just changed, the network administrator may need to refresh the router's portal files.

### My payment is pending or failed

1. Check **Billing → Payments** for the transaction status and reference.
2. Check the payment provider's status using its transaction reference.
3. If it is still pending, do not start another payment until staff confirm whether the first attempt was charged.
4. If the provider shows a completed payment but LKTECH does not, contact the platform administrator to check the provider callback and application logs.

An M-Pesa PIN is entered only in Safaricom's own phone prompt, never in LKTECH.

### The router is not responding to RADIUS

This check is for a network administrator. Confirm that the RADIUS service is running, the router can reach its address over the intended private route or VPN, and firewall rules allow the required UDP traffic on ports 1812 and 1813. Confirm that the router is registered as a RADIUS client and that its shared secret matches exactly. Do not expose RADIUS or router management to the public internet.

If the portal loads but authentication times out, check network reachability and server logs before changing the portal.

### Customers lost internet after router changes

This check is for a network administrator. Verify the physical WAN connection, WAN DHCP or PPPoE client, and default route. Confirm that the WAN port was not moved into the subscriber billing bridge, and that subscriber ports and LAN DHCP match the intended setup. Use the router backup and local management access if changes interrupted connectivity. Do not guess which port is WAN or factory-reset a live router.

### The router appears offline in the dashboard

1. Check that the router is powered on and its internet uplink is working.
2. Allow up to 90 seconds for a new monitoring report to arrive.
3. If it remains offline, ask the network administrator to check that the monitoring script and scheduler are enabled and that outbound HTTPS to LKTECH is allowed.
4. If the monitoring token was rotated, the administrator must generate and install the current script.

Monitoring reports status; it does not repair the router's internet connection.

### Live sessions or disconnect controls are unavailable

Live per-user session details and remote disconnects need the optional router API connector. Router monitoring alone does not provide these controls. Ask the platform or network administrator to confirm that the connector is installed, running, and connected over a trusted private network.

### An SMS is queued or failed

Staff should confirm the recipient number, provider status, and error detail in **Communications → SMS** before resending. The provider accepting a message does not guarantee delivery to the phone. Check the previous attempt first because resending can send a duplicate. If the queue is not progressing, ask the platform administrator to check scheduled processing and delivery callbacks.

## Who should handle it?

- **Hotspot customer:** reconnect to Wi-Fi, open the HTTP sign-in trigger, and contact the support number shown on the portal.
- **ISP Owner or Admin:** verify workspace, package, subscriber, payment, and message records in the dashboard.
- **Network administrator:** troubleshoot router ports, WAN, Hotspot, RADIUS, VPN, firewall, and router monitoring.
- **Platform administrator:** troubleshoot sign-in email delivery, database or application errors, payment callbacks, SMS scheduling, migrations, and deployment secrets.

## What to include when requesting help

Send the support team:

- The workspace name or portal address, and the affected site/router name if known.
- The page or action you were using and the exact error text.
- When the issue began, including the time zone.
- Whether one person, one site, or all sites are affected.
- A payment reference only when the issue concerns a payment, and only through your ISP's approved support channel.

Do not attach passwords, PINs, API keys, shared secrets, router tokens, private keys, session cookies, or unredacted customer exports.

## Further help

- [Full user and operator manual](./user-manual.md)
- [Hotspot M-Pesa setup](./hotspot-mpesa-setup.md)
- [PPPoE M-Pesa signup](./pppoe-mpesa-setup.md)