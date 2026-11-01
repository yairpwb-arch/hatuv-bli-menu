import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { useNotificationSetup } from "@/hooks/useNotificationSetup";

// Create the Android notification channel at app startup — always, regardless of route.
// Without this, FCM silently drops notifications on Android 8+ when the channel doesn't exist.
function AndroidChannelInit() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    PushNotifications.createChannel({
      id: 'general',
      name: 'כללי',
      description: 'התראות כלליות מהאפליקציה',
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
    }).catch(() => {});
  }, []);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// Android hardware/gesture back, the way a native app handles it: close an
// open dialog first, then go back within the app, and on a top-level screen
// send the app to the background instead of leaving a blank WebView.
const ROOT_PATHS = new Set(['/', '/app', '/admin', '/auth']);

function AndroidBackButton() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let handle: { remove: () => Promise<void> } | null = null;
    let cancelled = false;

    import('@capacitor/app').then(({ App }) =>
      App.addListener('backButton', () => {
        const openDialog = document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
        );
        if (openDialog) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return;
        }
        if (ROOT_PATHS.has(pathRef.current)) {
          App.minimizeApp();
          return;
        }
        const hasInAppHistory = (window.history.state?.idx ?? 0) > 0;
        if (hasInAppHistory) navigate(-1);
        else navigate(pathRef.current.startsWith('/admin') ? '/admin' : '/app', { replace: true });
      }).then((h) => {
        if (cancelled) h.remove();
        else handle = h;
      })
    );
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [navigate]);

  return null;
}

// Requests step counter (ACTIVITY_RECOGNITION) permission once at app startup.
function StepPermissionTrigger() {
  const { user } = useAuth();
  const triggered = useRef(false);

  useEffect(() => {
    if (!user || triggered.current) return;
    if (!Capacitor.isNativePlatform()) return;
    triggered.current = true;

    (async () => {
      try {
        if (Capacitor.getPlatform() === 'android') {
          const { StepCounter } = await import('@/plugins/StepCounterPlugin');
          const perm = await StepCounter.checkPermission();
          if (perm.activityRecognition !== 'granted') {
            await StepCounter.requestPermission();
          }
        } else {
          // iOS: trigger CMPedometer getMeasurement which auto-requests Motion & Fitness permission
          const { CapacitorPedometer } = await import('@capgo/capacitor-pedometer');
          const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
          await CapacitorPedometer.getMeasurement({ start: startOfDay.getTime(), end: Date.now() }).catch(() => {});
        }
      } catch { /* ignore */ }

      // After activity permission — request push notification permission
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
          await PushNotifications.requestPermissions();
        }
      } catch { /* ignore */ }
    })();
  }, [user?.id]);

  return null;
}

/**
 * Re-registers for push token on app startup if notifications were previously enabled.
 * Reads from notification_settings (source of truth, not profiles).
 * Never auto-requests permission — only calls enableNotifications if OS permission is granted.
 */
function NotificationPermissionTrigger() {
  const { user } = useAuth();
  const { enableNotifications } = useNotificationSetup();
  const triggered = useRef(false);

  useEffect(() => {
    if (!user || triggered.current) return;
    if (!Capacitor.isNativePlatform()) return;

    const check = async () => {
      try {
        const { data } = await supabase
          .from('notification_settings' as any)
          .select('notifications_enabled')
          .eq('user_id', user.id)
          .maybeSingle();

        if ((data as any)?.notifications_enabled === true) {
          console.log('[NotificationTrigger] Notifications enabled — re-registering token for user', user.id);
          triggered.current = true;
          await enableNotifications(user.id);
        }
      } catch (e) {
        console.error('[NotificationTrigger] Error:', e);
      }
    };

    check();
  }, [user?.id, enableNotifications]);

  return null;
}

import { lazy, Suspense } from "react";
import { BottomNav } from "./components/BottomNav";
import { AppHeader } from "./components/AppHeader";
import { ActiveWorkoutProvider, useActiveWorkout } from "@/contexts/ActiveWorkoutContext";
import { useAppReminders } from "@/hooks/useAppReminders";
import { UndoToaster } from "@/components/UndoToaster";
import { WorkoutMiniBar } from "./components/WorkoutMiniBar";
import { LaunchSplash } from "./components/LaunchSplash";
import { BrandedLoaderOverlay, FullScreenLoader } from "./components/BrandedLoader";
import { useOnboarding } from "@/hooks/useOnboarding";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const AppHome = lazy(() => import("./pages/AppHome"));
const AppContent = lazy(() => import("./pages/AppContent"));
const AppGuides = lazy(() => import("./pages/AppGuides"));
const AppGuide = lazy(() => import("./pages/AppGuide"));
const AppShoppingList = lazy(() => import("./pages/AppShoppingList"));
const AppCalendarDay = lazy(() => import("./pages/AppCalendarDay"));
const AppWalk = lazy(() => import("./pages/AppWalk"));
const AppNutrition = lazy(() => import("./pages/AppNutrition"));
const AppProfile = lazy(() => import("./pages/AppProfile"));
const AppTracker = lazy(() => import("./pages/AppTracker"));
const AppProgress = lazy(() => import("./pages/AppProgress"));
const AppWorkouts = lazy(() => import("./pages/AppWorkouts"));
const AppSettings = lazy(() => import("./pages/AppSettings"));
const AppReferral = lazy(() => import("./pages/AppReferral"));
const AppCalendar = lazy(() => import("./pages/AppCalendar"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminContent = lazy(() => import("./pages/admin/AdminContent"));
const AdminHabits = lazy(() => import("./pages/admin/AdminHabits"));
const AdminSurveys = lazy(() => import("./pages/admin/AdminSurveys"));
const AdminExercises = lazy(() => import("./pages/admin/AdminExercises"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const WorkoutActiveSession = lazy(() => import("./components/WorkoutActiveSession"));
const Pricing = lazy(() => import("./pages/Pricing"));
const JoinProgram = lazy(() => import("./pages/JoinProgram"));
const AccountDeletion = lazy(() => import("./pages/AccountDeletion"));

const PageLoader = () => (
  <FullScreenLoader />
);

const queryClient = new QueryClient();

function ProtectedRouteInner() {
  const { user, isLoading, isAdmin, profile } = useAuth();
  const { params, isVisible, minimize, end } = useActiveWorkout();
  const { pathname } = useLocation();
  const { stage: onboardingStage } = useOnboarding(user?.id);
  useAppReminders(user?.id);

  if (isLoading) {
    return (
      <FullScreenLoader />
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // User is authenticated but profile hasn't loaded yet — wait instead of
  // redirecting, because !null?.is_active === true would send admin-created
  // users straight to /pricing on every first login.
  if (!profile) {
    return (
      <FullScreenLoader />
    );
  }

  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  // New trainees finish onboarding (questionnaire → video → permissions)
  // before reaching the app.
  if (!onboardingStage) {
    return (
      <FullScreenLoader />
    );
  }
  if (onboardingStage !== 'done') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <NotificationPermissionTrigger />
      <StepPermissionTrigger />
      <AppHeader />
      {/* Keyed by route so each screen fades in on navigation. Opacity only —
          a transform here would re-anchor the pages' position:fixed elements
          to this wrapper for the length of the animation. */}
      <div key={pathname} className="max-w-2xl mx-auto motion-safe:animate-page-enter">
        <Outlet />
      </div>
      <BottomNav />
      <UndoToaster />

      {/* WorkoutMiniBar — shown when session is minimized */}
      <WorkoutMiniBar />

      {/* WorkoutActiveSession — mounted at root so it persists across navigation.
          Wrapped in hidden div when minimized: React state is preserved but overlay is hidden. */}
      {params && (
        <div className={!isVisible ? 'hidden' : ''}>
          <WorkoutActiveSession
            key={params.planDay.id}
            planDay={params.planDay}
            exercises={params.exercises}
            onMinimize={minimize}
            onFinish={async (result) => {
              await params.onFinish(result);
              end();
            }}
            onDiscard={end}
          />
        </div>
      )}
    </div>
  );
}

function ProtectedRoute() {
  return (
    <ActiveWorkoutProvider>
      <ProtectedRouteInner />
    </ActiveWorkoutProvider>
  );
}

function AuthRoute() {
  const { user, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <FullScreenLoader />
    );
  }

  if (user) {
    if (isAdmin) return <Navigate to="/admin" replace />;
    return <Navigate to="/app" replace />;
  }

  return <Auth />;
}

function IndexRoute() {
  const { user, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <FullScreenLoader />
    );
  }

  if (user) {
    if (isAdmin) return <Navigate to="/admin" replace />;
    return <Navigate to="/app" replace />;
  }

  return <Index />;
}

const App = () => (
  <ThemeProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AndroidChannelInit />
        <ScrollToTop />
        <AndroidBackButton />
        <LaunchSplash />
        <AuthProvider>
          <BrandedLoaderOverlay />
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<IndexRoute />} />
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/join" element={<JoinProgram />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/account-deletion" element={<AccountDeletion />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/app" element={<ProtectedRoute />}>
              <Route index element={<AppHome />} />
              <Route path="content" element={<AppContent />} />
              <Route path="guides" element={<AppGuides />} />
              <Route path="guides/:id" element={<AppGuide />} />
              <Route path="shopping-list" element={<AppShoppingList />} />
              <Route path="nutrition" element={<AppNutrition />} />
              <Route path="tracker" element={<AppTracker />} />
              <Route path="progress" element={<AppProgress />} />
              <Route path="workouts" element={<AppWorkouts />} />
              <Route path="profile" element={<AppProfile />} />
              <Route path="settings" element={<AppSettings />} />
              <Route path="referral" element={<AppReferral />} />
              <Route path="calendar" element={<AppCalendar />} />
              <Route path="calendar/day/:day" element={<AppCalendarDay />} />
              <Route path="walk" element={<AppWalk />} />
            </Route>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="content" element={<AdminContent />} />
              <Route path="habits" element={<AdminHabits />} />
              <Route path="surveys" element={<AdminSurveys />} />
              <Route path="exercises" element={<AdminExercises />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;