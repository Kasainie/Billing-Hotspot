import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'life.lktech.billing',
  appName: 'LKTECH',
  webDir: 'www',
  server: {
    url: 'https://billing.lktech.life/login',
    cleartext: false,
    allowNavigation: ['*.lktech.life'],
  },
  plugins: {
    LocalNotifications: {
      sound: 'notification.wav',
    },
  },
}

export default config
