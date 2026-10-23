import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hatovblitafrit.hatovblitafrit',
  appName: 'חטוב בלי תפריט',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    // capacitor-health is iOS-only here (HealthKit). On Android, steps come
    // from the device step sensor, and shipping the plugin pulls in the
    // Health Connect SDK — Google Play rejects apps that carry Health Connect
    // without using it (minimum-scope policy). Any new Android plugin must be
    // added to this list.
    includePlugins: [
      '@capacitor/app',
      '@capacitor/camera',
      '@capacitor/preferences',
      '@capacitor/push-notifications',
      '@capgo/capacitor-pedometer',
      '@revenuecat/purchases-capacitor',
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
