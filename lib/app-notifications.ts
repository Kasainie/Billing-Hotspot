import { Capacitor, registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

export type DeviceNotificationPermission = 'granted' | 'prompt' | 'denied' | 'unsupported'

type AppNotification = {
  id: string
  title: string
  detail: string
}

type AppNotificationSettingsPlugin = {
  open(): Promise<void>
}

declare global {
  interface Window {
    lktechDesktop?: {
      openNotificationSettings(): Promise<void>
      openDownload(url: string): Promise<void>
    }
  }
}

const AppNotificationSettings = registerPlugin<AppNotificationSettingsPlugin>('AppNotificationSettings')

function getPermissionState(permission: string): DeviceNotificationPermission {
  if (permission === 'granted' || permission === 'denied') return permission
  if (permission === 'prompt' || permission === 'prompt-with-rationale') return 'prompt'
  return 'unsupported'
}

function getNativeNotificationId(value: string) {
  let hash = 0
  for (const character of value) {
    hash = Math.imul(hash, 31) + character.charCodeAt(0) | 0
  }
  return hash & 0x7fffffff || 1
}

export async function checkDeviceNotificationPermission(): Promise<DeviceNotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    const { display } = await LocalNotifications.checkPermissions()
    return getPermissionState(display)
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return getPermissionState(Notification.permission)
}

export async function requestDeviceNotificationPermission(): Promise<DeviceNotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    const { display } = await LocalNotifications.requestPermissions()
    return getPermissionState(display)
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return getPermissionState(await Notification.requestPermission())
}

export async function openDeviceNotificationSettings() {
  if (Capacitor.isNativePlatform()) {
    await AppNotificationSettings.open()
    return true
  }
  if (window.lktechDesktop) {
    await window.lktechDesktop.openNotificationSettings()
    return true
  }
  return false
}

export async function playNotificationSound() {
  if (typeof window === 'undefined') throw new Error('Notification sound is unavailable outside the browser.')
  const audio = new Audio('/notification.wav')
  audio.volume = 0.6
  await audio.play()
}

export async function showDeviceNotification(notification: AppNotification) {
  if (Capacitor.isNativePlatform()) {
    await LocalNotifications.schedule({
      notifications: [{
        id: getNativeNotificationId(notification.id),
        title: notification.title,
        body: notification.detail,
        channelId: 'default',
      }],
    })
    return
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    throw new Error('Device notifications are not supported in this app.')
  }
  if (Notification.permission !== 'granted') {
    throw new Error('Device notification permission has not been granted.')
  }

  const systemNotification = new Notification(notification.title, {
    body: notification.detail,
    icon: '/favicon.png',
    tag: `lktech-${notification.id}`,
  })
  systemNotification.onclick = () => window.focus()
}
