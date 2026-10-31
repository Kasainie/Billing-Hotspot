# LKTECH desktop and Android apps

The Android and Windows apps wrap the hosted LKTECH service at `https://billing.lktech.life`. They need an internet connection; application data and backend services remain hosted.

The dashboard plays a short sound when a new alert appears for a pending payment, inactive site, or upcoming subscription expiration. Open **Notifications → Enable** to allow matching operating-system notifications. If permission was previously blocked, choose **Open settings**, allow LKTECH notifications, and return to the dashboard. Android opens LKTECH's app notification settings; Windows opens notification settings. Android uses the device notification sound; Windows uses the system notification service. Alerts are detected while the signed-in dashboard is running and connected; background push delivery is not configured.

## Android APK

The Android Studio SDK must include Android platform 36 and Android Build Tools. Use JDK 21 with Gradle 8.14.3. In PowerShell, configure the SDK and JDK for the current terminal and build a debug APK:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:JAVA_HOME = "$env:LOCALAPPDATA\Android\jdk-21"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
corepack pnpm install
corepack pnpm run app:android:apk
```

The sideloadable debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. It opens `https://billing.lktech.life/login`, matching the Windows app and hotspot allowlist, and the Android Back button navigates through in-app page history. This debug build is not a Play Store release; publishing requires a protected release signing key and a release build configuration. A manual GitHub Actions workflow is also available at **Actions → Build Android APK** after the changes are pushed.

Production installers are available from [`https://billing.lktech.life/downloads`](https://billing.lktech.life/downloads).

## Windows installer

On Windows, run:

```powershell
corepack pnpm install
corepack pnpm run app:windows
```

The installer is written to `release/windows/LKTECH Setup 1.0.0.exe`. Its Navigation menu and shortcuts provide Back, Forward, Reload, and LKTECH Home if a Wi-Fi captive portal opens inside the app. Automatic certificate discovery is disabled during packaging so an unrelated machine certificate cannot mutate the installer executable. The installer is unsigned; Windows may display a SmartScreen warning until it is signed with an organization code-signing certificate.

The Windows build produces separate installers for 64-bit (`x64`) and 32-bit (`ia32`) Windows:

- `release/windows/LKTECH Setup 1.0.0 (x64).exe`
- `release/windows/LKTECH Setup 1.0.0 (ia32).exe`

Install the x64 build on 64-bit Windows and the ia32 build on 32-bit Windows. The ia32 runtime uses Electron 41; Electron stopped publishing new 32-bit Windows binaries starting with Electron 44, so retain the existing Electron 41 version if rebuilding the 32-bit installer.
