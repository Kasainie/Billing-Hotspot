const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('lktechDesktop', {
  openNotificationSettings: () => ipcRenderer.invoke('open-notification-settings'),
  openDownload: (url) => ipcRenderer.invoke('open-download', url),
})
