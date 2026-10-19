# LKTECH desktop and Android apps

The Android and Windows apps wrap the hosted LKTECH service at `https://login.lktech.life`. They need an internet connection; application data and backend services remain hosted.

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

The sideloadable debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. This debug build is not a Play Store release; publishing requires a protected release signing key and a release build configuration. A manual GitHub Actions workflow is also available at **Actions → Build Android APK** after the changes are pushed.

## Windows installer

On Windows, run:

```powershell
corepack pnpm install
corepack pnpm run app:windows
```

The installer is written to `release/windows/LKTECH Setup 1.0.0.exe`. It is currently unsigned; Windows may display a SmartScreen warning until the installer is signed with an organization code-signing certificate.
