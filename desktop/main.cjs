const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')
const windowStateKeeper = require('electron-window-state')

const appUrl = 'https://login.lktech.life'
const trustedHosts = new Set(['login.lktech.life', 'billing.lktech.life'])
const isTrustedUrl = (value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && trustedHosts.has(url.hostname)
  } catch {
    return false
  }
}

const openExternalUrl = (value) => {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' || url.protocol === 'mailto:' || url.protocol === 'tel:') {
      void shell.openExternal(value).catch((error) => {
        console.error('Unable to open external LKTECH link', error)
      })
    }
  } catch (error) {
    console.error('Unable to parse external LKTECH link', error)
  }
}

const createWindow = () => {
  const windowState = windowStateKeeper({
    defaultWidth: 1440,
    defaultHeight: 960,
  })
  const window = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#090812',
    icon: path.join(__dirname, 'assets', 'favicon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  windowState.manage(window)
  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) {
      event.preventDefault()
      openExternalUrl(url)
    }
  })
  void window.loadURL(appUrl).catch((error) => {
    console.error('Unable to load LKTECH', error)
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((error) => {
  console.error('Unable to start LKTECH', error)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
