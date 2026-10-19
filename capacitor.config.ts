import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'life.lktech.billing',
  appName: 'LKTECH',
  webDir: 'www',
  server: {
    url: 'https://login.lktech.life',
    cleartext: false,
    allowNavigation: ['*.lktech.life'],
  },
}

export default config
