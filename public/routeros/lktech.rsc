# LKTECH router provisioning bootstrap
# Paste a one-time URL from the guided router provisioning flow below.
:local provisioningUrl "https://billing.lktech.life/provision/PASTE_SHORT_LIVED_TOKEN"
:if ($provisioningUrl = "https://billing.lktech.life/provision/PASTE_SHORT_LIVED_TOKEN") do={
  :error "Replace provisioningUrl with the one-time URL from the LKTECH router setup flow."
}
:if ([:len [/file find where name="lktech-provisioning.rsc"]] > 0) do={/file remove [find where name="lktech-provisioning.rsc"]}
/tool fetch mode=https url=$provisioningUrl dst-path=lktech-provisioning.rsc
:delay 2s
/import lktech-provisioning.rsc
