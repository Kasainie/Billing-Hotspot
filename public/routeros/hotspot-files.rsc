# hotspot-files.rsc
:if ([:len [/file find where name="flash"]] > 0) do={
:if ([:len [/file find where name="flash/hotspot"]] = 0) do={/file add name="flash/hotspot" type=directory}
:if ([:len [/file find where name="flash/hotspot/login.html"]] > 0) do={/file remove [find where name="flash/hotspot/login.html"]}
/tool fetch url="https://billing.lktech.life/api/hotspot/portal-login" dst-path="flash/hotspot/login.html" keep-result=yes
:if ([:len [/file find where name="flash/hotspot/status.html"]] > 0) do={/file remove [find where name="flash/hotspot/status.html"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/status.html" dst-path="flash/hotspot/status.html" keep-result=yes
:if ([:len [/file find where name="flash/hotspot/logout.html"]] > 0) do={/file remove [find where name="flash/hotspot/logout.html"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/logout.html" dst-path="flash/hotspot/logout.html" keep-result=yes
:if ([:len [/file find where name="flash/hotspot/error.html"]] > 0) do={/file remove [find where name="flash/hotspot/error.html"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/error.html" dst-path="flash/hotspot/error.html" keep-result=yes
:if ([:len [/file find where name="flash/hotspot/alogin.html"]] > 0) do={/file remove [find where name="flash/hotspot/alogin.html"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/alogin.html" dst-path="flash/hotspot/alogin.html" keep-result=yes
:if ([:len [/file find where name="flash/hotspot/api.json"]] > 0) do={/file remove [find where name="flash/hotspot/api.json"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/api.json" dst-path="flash/hotspot/api.json" keep-result=yes
:if ([:len [/file find where name="flash/hotspot/style.css"]] > 0) do={/file remove [find where name="flash/hotspot/style.css"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/style.css" dst-path="flash/hotspot/style.css" keep-result=yes
:if ([:len [/file find where name="flash/hotspot/md5.js"]] > 0) do={/file remove [find where name="flash/hotspot/md5.js"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/md5.js" dst-path="flash/hotspot/md5.js" keep-result=yes
} else={
:if ([:len [/file find where name="hotspot"]] = 0) do={/file add name="hotspot" type=directory}
:if ([:len [/file find where name="hotspot/login.html"]] > 0) do={/file remove [find where name="hotspot/login.html"]}
/tool fetch url="https://billing.lktech.life/api/hotspot/portal-login" dst-path="hotspot/login.html" keep-result=yes
:if ([:len [/file find where name="hotspot/status.html"]] > 0) do={/file remove [find where name="hotspot/status.html"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/status.html" dst-path="hotspot/status.html" keep-result=yes
:if ([:len [/file find where name="hotspot/logout.html"]] > 0) do={/file remove [find where name="hotspot/logout.html"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/logout.html" dst-path="hotspot/logout.html" keep-result=yes
:if ([:len [/file find where name="hotspot/error.html"]] > 0) do={/file remove [find where name="hotspot/error.html"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/error.html" dst-path="hotspot/error.html" keep-result=yes
:if ([:len [/file find where name="hotspot/alogin.html"]] > 0) do={/file remove [find where name="hotspot/alogin.html"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/alogin.html" dst-path="hotspot/alogin.html" keep-result=yes
:if ([:len [/file find where name="hotspot/api.json"]] > 0) do={/file remove [find where name="hotspot/api.json"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/api.json" dst-path="hotspot/api.json" keep-result=yes
:if ([:len [/file find where name="hotspot/style.css"]] > 0) do={/file remove [find where name="hotspot/style.css"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/style.css" dst-path="hotspot/style.css" keep-result=yes
:if ([:len [/file find where name="hotspot/md5.js"]] > 0) do={/file remove [find where name="hotspot/md5.js"]}
/tool fetch url="https://billing.lktech.life/hotspot-assets/md5.js" dst-path="hotspot/md5.js" keep-result=yes
}
