export function buildRouterMonitorScript({
  routerId,
  monitorToken,
  telemetryUrl,
}: {
  routerId: string
  monitorToken: string
  telemetryUrl: string
}) {
  if (!/^[0-9a-f-]{36}$/i.test(routerId) || !/^[A-Za-z0-9_-]{43}$/.test(monitorToken)) {
    throw new Error('Router monitoring credentials are invalid.')
  }
  const url = new URL(telemetryUrl)
  const localDevelopmentUrl = process.env.NODE_ENV === 'development' &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !localDevelopmentUrl) {
    throw new Error('Router monitoring requires HTTPS.')
  }

  return [
    ':if ([:len [/system scheduler find where name="lktech-monitor"]] > 0) do={/system scheduler remove [find where name="lktech-monitor"]}',
    ':if ([:len [/system script find where name="lktech-monitor"]] > 0) do={/system script remove [find where name="lktech-monitor"]}',
    '/system script add name="lktech-monitor" policy=read,write,test source={',
    `  :local reportUrl "${url.toString()}"`,
    `  :local monitorId "${routerId}"`,
    `  :local monitorToken "${monitorToken}"`,
    '  :local rxBytes 0',
    '  :local txBytes 0',
    '  :foreach interfaceStats in=[/interface ethernet print stats as-value] do={:set rxBytes ($rxBytes + ($interfaceStats->"rx-byte")); :set txBytes ($txBytes + ($interfaceStats->"tx-byte"))}',
    '  :local report {"cpuLoad"=[/system resource get cpu-load];"freeMemoryBytes"=[/system resource get free-memory];"totalMemoryBytes"=[/system resource get total-memory];"freeDiskBytes"=[/system resource get free-hdd-space];"totalDiskBytes"=[/system resource get total-hdd-space];"totalRxBytes"=$rxBytes;"totalTxBytes"=$txBytes;"activeHotspotUsers"=[/ip hotspot active print count-only];"activePppoeUsers"=[/ppp active print count-only];"uptime"=[/system resource get uptime];"routerOsVersion"=[/system resource get version];"boardName"=[/system resource get board-name]}',
    '  :local payload [:serialize value=$report to=json]',
    '  :do {/tool fetch url=$reportUrl http-method=post http-data=$payload http-header-field=("content-type:application/json,x-router-monitor-id:" . $monitorId . ",x-router-monitor-token:" . $monitorToken) keep-result=no} on-error={:log warning "LKTECH router monitoring heartbeat failed"}',
    '}',
    '/system scheduler add name="lktech-monitor" interval=1m start-time=startup on-event="/system script run lktech-monitor" policy=read,write,test',
    '/system script run lktech-monitor',
  ].join('\n')
}
