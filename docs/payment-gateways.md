# Workspace payment gateways

Workspace administrators can configure Pesapal and IntaSend from **Settings → Payments**. Each workspace uses its own merchant account and settles in KES. These gateways support both hotspot package purchases and PPPoE sign-up.

## Setup

1. Apply the gateway migrations in `supabase/migrations` to the target database before deploying the application.
2. Configure `TENANT_SECRETS_ENCRYPTION_KEY` as a 32-byte key (hex or base64) in the application environment. Gateway credentials are encrypted with this key.
3. Add merchant credentials under **Settings → Payments**. Start in sandbox mode, verify the complete checkout and payment-confirmation flow, and only then select production.
4. For IntaSend, register `https://<your-app-host>/api/payment-gateways/intasend/webhook` in the merchant dashboard for collection events. Enter the same high-entropy challenge value in the webhook and the workspace's IntaSend settings.
5. Pesapal registers the payment notification URL during checkout. Its IPN notification is only a prompt to check transaction status; it is not proof of payment.

The application checks the provider's server-side status and requires the reference, KES currency, and amount to match the pending checkout before it creates RADIUS access or records payment. Browser redirects and webhook contents alone never grant access. Fulfillment is protected against duplicate provider notifications.

## Availability

- **Pesapal:** API 3.0 hosted checkout, transaction-status verification, and IPN.
- **IntaSend:** hosted checkout, challenge-checked collection webhooks, and invoice-status verification.
- **Airtel Money:** intentionally unavailable until the merchant API contract, KES support, and transaction-verification behavior can be confirmed from official merchant documentation.

Merchant accounts and credentials are required before sandbox or production payments can be exercised. The gateway changes are not production-ready until database migrations are applied and end-to-end sandbox tests pass.

## Provider documentation

- [Pesapal API 3.0](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json)
- [IntaSend hosted checkout](https://developers.intasend.com/guides/collections/checkout/)
- [IntaSend collection status](https://developers.intasend.com/guides/collections/overview/)
- [IntaSend webhooks](https://developers.intasend.com/guides/webhooks/)
- [IntaSend authentication](https://developers.intasend.com/guides/authentication/)
