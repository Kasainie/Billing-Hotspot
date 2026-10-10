# hotspot.rsc
:do {
:local hotspotDirectory "hotspot"
:if ([:len [/file find where name="flash"]] > 0) do={:set hotspotDirectory "flash/hotspot"}
:local hotspotCertificates [/certificate find where common-name="login.lktech.life" and trusted=yes]
:if ([:len $hotspotCertificates] = 1) do={
  :local hotspotCertificateName [/certificate get [:pick $hotspotCertificates 0] name]
  :if ([:len [/ip hotspot profile find where name="billing-hotspot-profile"]] = 0) do={
    /ip hotspot profile add name="billing-hotspot-profile" html-directory=$hotspotDirectory dns-name="login.lktech.life" ssl-certificate=$hotspotCertificateName login-by=https,http-chap use-radius=yes radius-accounting=yes radius-interim-update=1m
  } else={
    /ip hotspot profile set [find where name="billing-hotspot-profile"] html-directory=$hotspotDirectory dns-name="login.lktech.life" ssl-certificate=$hotspotCertificateName login-by=https,http-chap use-radius=yes radius-accounting=yes radius-interim-update=1m
  }
  :put "Trusted portal certificate configured; renew DHCP leases to advertise captive-portal discovery"
} else={
  :if ([:len [/ip hotspot profile find where name="billing-hotspot-profile"]] = 0) do={
    /ip hotspot profile add name="billing-hotspot-profile" html-directory=$hotspotDirectory dns-name="login.lktech.life" login-by=http-chap use-radius=yes radius-accounting=yes radius-interim-update=1m
  } else={
    /ip hotspot profile set [find where name="billing-hotspot-profile"] html-directory=$hotspotDirectory dns-name="login.lktech.life" login-by=http-chap use-radius=yes radius-accounting=yes radius-interim-update=1m
  }
  :put "No trusted login.lktech.life certificate found; Android automatic captive-portal discovery remains unavailable"
}
:local hotspotGateway [/ip hotspot profile get [find where name="billing-hotspot-profile"] hotspot-address]
:if ([:len $hotspotGateway] > 0) do={
  /ip dns set allow-remote-requests=yes
  :local hotspotDhcpNetworks [/ip dhcp-server network find where gateway=$hotspotGateway]
  :if ([:len $hotspotDhcpNetworks] > 0) do={/ip dhcp-server network set $hotspotDhcpNetworks dns-server=$hotspotGateway} else={:put "Set the Hotspot DHCP network DNS server to the router Hotspot address"}
}
}
