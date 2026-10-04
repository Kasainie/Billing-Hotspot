# PPPoE M-Pesa Signup

The public signup page is `/pppoe/signup`. It only lists live, listed PPPoE packages. A customer submits their name, email, and M-Pesa phone number, then approves an STK Push. After Safaricom confirms the payment, the billing system creates the customer and FreeRADIUS login, activates the package for its duration, and shows the PPPoE username/password and a persistent PayBill account number.

Apply migration `20261003100000_add_pppoe_customer_accounts.sql` and the multitenant migration before deploying the page. Configure this ISP's Daraja credentials and HTTPS callback URL in **Billing → Payment settings**; the existing callback endpoint handles both PPPoE and hotspot transactions. See [hotspot-mpesa-setup.md](./hotspot-mpesa-setup.md) and the [multitenant deployment guide](./multitenancy.md).

The application database role needs insert, select, and update access to `pppoe_accounts` and `pppoe_payments`, plus permission to use the PPPoE account-number identity sequence. Enable the FreeRADIUS `expiration` module in the `authorize` section after SQL so the PPPoE `Expiration` check item blocks access when the paid term ends. The account number is reused for future STK Pushes from the same normalized phone number and sent as Daraja `AccountReference`. This integration does not reconcile manually initiated PayBill transfers.
