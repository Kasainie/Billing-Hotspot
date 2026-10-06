# hotspot-files.rsc
:if ([:len [/file find where name="flash"]] > 0) do={
:if ([:len [/file find where name="flash/hotspot"]] = 0) do={/file add name="flash/hotspot" type=directory}
/tool fetch url="https://billing.lktech.life/api/hotspot/portal-login" dst-path="flash/hotspot/login.html" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/status.html" dst-path="flash/hotspot/status.html" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/logout.html" dst-path="flash/hotspot/logout.html" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/error.html" dst-path="flash/hotspot/error.html" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/alogin.html" dst-path="flash/hotspot/alogin.html" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/api.json" dst-path="flash/hotspot/api.json" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/style.css" dst-path="flash/hotspot/style.css" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/md5.js" dst-path="flash/hotspot/md5.js" keep-result=yes
} else={
:if ([:len [/file find where name="hotspot"]] = 0) do={/file add name="hotspot" type=directory}
/tool fetch url="https://billing.lktech.life/api/hotspot/portal-login" dst-path="hotspot/login.html" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/status.html" dst-path="hotspot/status.html" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/logout.html" dst-path="hotspot/logout.html" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/error.html" dst-path="hotspot/error.html" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/alogin.html" dst-path="hotspot/alogin.html" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/api.json" dst-path="hotspot/api.json" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/style.css" dst-path="hotspot/style.css" keep-result=yes
/tool fetch url="https://billing.lktech.life/hotspot-assets/md5.js" dst-path="hotspot/md5.js" keep-result=yes
}
