const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('node:path')
const windowStateKeeper = require('electron-window-state')

const appUrl = 'https://billing.lktech.life/login'
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
    autoHideMenuBar: false,
    title: 'LKTECH Desktop',
    backgroundColor: '#090812',
    icon: path.join(__dirname, 'assets', 'favicon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  windowState.manage(window)
  const navigationMenu = Menu.buildFromTemplate([
    {
      label: 'Back',
      accelerator: 'Alt+Left',
      enabled: false,
      click: () => {
        if (window.webContents.canGoBack()) window.webContents.goBack()
      },
    },
    {
      label: 'Forward',
      accelerator: 'Alt+Right',
      enabled: false,
      click: () => {
        if (window.webContents.canGoForward()) window.webContents.goForward()
      },
    },
    { type: 'separator' },
    {
      label: 'Reload',
      accelerator: 'Ctrl+R',
      click: () => window.webContents.reload(),
    },
    {
      label: 'LKTECH Home',
      accelerator: 'Alt+Home',
      click: () => {
        void window.loadURL(appUrl).catch((error) => {
          console.error('Unable to open LKTECH home', error)
        })
      },
    },
  ])
  const applicationMenu = Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'Navigation', submenu: navigationMenu },
  ])
  Menu.setApplicationMenu(applicationMenu)
  const updateNavigationMenu = () => {
    navigationMenu.items[0].enabled = window.webContents.canGoBack()
    navigationMenu.items[1].enabled = window.webContents.canGoForward()
  }
  window.webContents.on('did-navigate', updateNavigationMenu)
  window.webContents.on('did-navigate-in-page', updateNavigationMenu)
  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault()
    window.setTitle('LKTECH Desktop')
  })
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
