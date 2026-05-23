# חטוב בלי תפריט — Claude Code Onboarding

## Project Overview
A React + Capacitor fitness/nutrition coaching app for iOS and Android.
Stack: React + Vite + TypeScript + Capacitor + Supabase (PostgreSQL) + shadcn/ui

**Repo:** https://github.com/yairpwb-arch/hatuv-bli-menu

## Key Technical Details

### Stack
- **Frontend:** React + Vite + TypeScript + shadcn/ui + Tailwind CSS
- **Mobile:** Capacitor (iOS + Android)
- **Backend:** Supabase (auth, PostgreSQL, Edge Functions)
- **Notifications:** OneSignal (via push-notification Edge Function)
- **Build:** `npm run build` → `npx cap sync`

### Version (current: 3.9)
- `package.json`: version field
- `android/app/build.gradle`: versionCode + versionName
- `ios/App/App.xcodeproj/project.pbxproj`: CURRENT_PROJECT_VERSION + MARKETING_VERSION

### Current Architecture (v3.9+)
- **No IAP / subscriptions** — app is free, all users get full access
- Registration at `/pricing` (Pricing.tsx) → navigate to `/app` after signup
- Login at `/auth` (Auth.tsx) → navigate to `/app`
- No payment gates in routing (removed from App.tsx, Auth.tsx)

### Auth Flow
- `useAuth.tsx` — AuthContext with user, profile, currentDay, currentWeek, planDays
- `currentDay` = days since `profile.start_date` (used for content unlocking)
- `planDays` = `profile.plan_duration_days ?? 168` (used to cap habits after program end)
- After registration: profile gets `is_active = true` and `start_date = today`

### Key Files
- `src/hooks/useAuth.tsx` — auth context
- `src/pages/Pricing.tsx` — registration page
- `src/pages/Auth.tsx` — login page
- `src/App.tsx` — routing
- `src/pages/AppSettings.tsx` — user settings (includes account deletion)
- `src/pages/AccountDeletion.tsx` — deletion policy page
- `src/pages/admin/AdminUsers.tsx` — admin user management
- `src/pages/admin/AdminContent.tsx` — manage program content
- `supabase/functions/` — Edge Functions (push-notification, delete-account, admin-create-user)

### Content System
- `program_content` table: `part_number` (1–5), `sort_order`, `content_type` (video/guide/content)
- Part 5 = "הבסיס לשינוי הרגלים"
- Content unlocked based on `currentDay`
- `AppContent.tsx` has filter tabs: כל | סרטונים | מדריכים | ידע | הרגלי בונוס

### Account Deletion
- Button in Settings → "מחיקת חשבון" (requires typing "מחק")
- Button at bottom of `/pricing` registration page
- Edge Function: `supabase/functions/delete-account`
- Policy page: `/account-deletion`

### Admin
- Route: `/admin`
- `AdminUsers.tsx` — shows ALL users (no is_active filter)
- `AdminContent.tsx` — program content management with sort_order shifting
- Admin users created via `admin-create-user` Edge Function

### Supabase Migrations
Located in `supabase/migrations/`. Apply with `npx supabase db push`.
Last migration: `20260520000001_allow_part_5.sql` — allows part_number 5 in program_content.

## Common Tasks

### Bump version
1. `package.json` → version
2. `android/app/build.gradle` → versionCode + versionName
3. `ios/App/App.xcodeproj/project.pbxproj` → CURRENT_PROJECT_VERSION + MARKETING_VERSION (replace_all)
Then: `npm run build && npx cap sync && git add -A && git commit && git push`

### Add DB migration
Create file in `supabase/migrations/` with timestamp name → `npx supabase db push`

### Push notifications
- Edge Function: `supabase/functions/push-notification/index.ts`
- Settings stored in `notification_settings` table (not profiles)
- Hook: `src/hooks/useNotificationSetup.ts`

## App Store Status
- iOS App: version 1.0, currently in review
- IAP removed in v3.9 (no longer needed)
- Account deletion implemented in 2 locations
