# config.rsc
:if ([:len [/radius find where comment="billing-system-managed"]] = 0) do={:error "Billing RADIUS client is missing"}
:put "Billing RADIUS client is ready"
