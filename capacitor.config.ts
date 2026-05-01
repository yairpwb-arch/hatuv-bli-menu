import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hatovblitafrit.hatovblitafrit',
  appName: 'חטוב בלי תפריט',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
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
