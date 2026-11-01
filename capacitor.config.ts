import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hatovblitafrit.hatovblitafrit',
  appName: 'חטוב בלי תפריט',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    // Android plugin allowlist — any new Android plugin must be added here.
    // capacitor-health brings the Health Connect SDK; it's used on Android
    // only for smartwatch workouts, and AndroidManifest.xml limits it to the
    // three permissions that feature reads (Play's minimum-scope policy).
    includePlugins: [
      '@capacitor/app',
      '@capacitor/camera',
      '@capacitor/haptics',
      '@capacitor/local-notifications',
      '@capacitor/preferences',
      '@capacitor/push-notifications',
      '@capacitor/status-bar',
      '@capgo/capacitor-pedometer',
      '@ebarooni/capacitor-calendar',
      'capacitor-health',
      '@revenuecat/purchases-capacitor',
      // GPS walk: location with the screen locked (foreground service), screen on, sharing the image.
      '@capacitor-community/background-geolocation',
      '@capacitor-community/keep-awake',
      '@capacitor/filesystem',
      '@capacitor/share',
    ],
  },
  plugins: {
    // iOS: NSMotionUsageDescription must be added to ios/App/App/Info.plist
    // after running: npx cap add ios
    // Key: NSMotionUsageDescription
    // Value: "האפליקציה משתמשת בחיישן התנועה כדי לספור את הצעדים היומיים שלך"
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
