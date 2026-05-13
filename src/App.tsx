import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
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
          // Android: use our custom StepCounterPlugin which declares ACTIVITY_RECOGNITION
          const { StepCounter } = await import('@/plugins/StepCounterPlugin');
          const perm = await StepCounter.checkPermission();
          if (perm.activityRecognition !== 'granted') {
            await StepCounter.requestPermission();
          }
        } else {
          // iOS: CMPedometer permission via @capgo/capacitor-pedometer
          const { CapacitorPedometer } = await import('@capgo/capacitor-pedometer');
          const perm = await CapacitorPedometer.checkPermissions();
          if (perm.activityRecognition !== 'granted') {
            await CapacitorPedometer.requestPermissions();
          }
        }
      } catch { /* plugin not available — ignore */ }
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
import { WorkoutMiniBar } from "./components/WorkoutMiniBar";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const AppHome = lazy(() => import("./pages/AppHome"));
const AppContent = lazy(() => import("./pages/AppContent"));
const AppNutrition = lazy(() => import("./pages/AppNutrition"));
const AppProfile = lazy(() => import("./pages/AppProfile"));
const AppTracker = lazy(() => import("./pages/AppTracker"));
const AppProgress = lazy(() => import("./pages/AppProgress"));
const AppWorkouts = lazy(() => import("./pages/AppWorkouts"));
const AppSettings = lazy(() => import("./pages/AppSettings"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminContent = lazy(() => import("./pages/admin/AdminContent"));
const AdminQuotes = lazy(() => import("./pages/admin/AdminQuotes"));
const AdminHabits = lazy(() => import("./pages/admin/AdminHabits"));
const AdminSurveys = lazy(() => import("./pages/admin/AdminSurveys"));
const AdminExercises = lazy(() => import("./pages/admin/AdminExercises"));
const NotFound = lazy(() => import("./pages/NotFound"));
const WorkoutActiveSession = lazy(() => import("./components/WorkoutActiveSession"));
const Pricing = lazy(() => import("./pages/Pricing"));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const queryClient = new QueryClient();

function ProtectedRouteInner() {
  const { user, isLoading, isAdmin, profile } = useAuth();
  const { params, isVisible, minimize, end } = useActiveWorkout();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (!profile?.is_active) {
    return <Navigate to="/pricing" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <NotificationPermissionTrigger />
      <StepPermissionTrigger />
      <AppHeader />
      <Outlet />
      <BottomNav />

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
            onFinish={async (durationMinutes, logs) => {
              await params.onFinish(durationMinutes, logs);
              end();
            }}
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
  const { user, isLoading, isAdmin, profile } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    if (isAdmin) return <Navigate to="/admin" replace />;
    if (!profile?.is_active) return <Navigate to="/pricing" replace />;
    return <Navigate to="/app" replace />;
  }

  return <Auth />;
}

const App = () => (
  <ThemeProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AndroidChannelInit />
        <ScrollToTop />
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/app" element={<ProtectedRoute />}>
              <Route index element={<AppHome />} />
              <Route path="content" element={<AppContent />} />
              <Route path="nutrition" element={<AppNutrition />} />
              <Route path="tracker" element={<AppTracker />} />
              <Route path="progress" element={<AppProgress />} />
              <Route path="workouts" element={<AppWorkouts />} />
              <Route path="profile" element={<AppProfile />} />
              <Route path="settings" element={<AppSettings />} />
            </Route>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="content" element={<AdminContent />} />
              <Route path="quotes" element={<AdminQuotes />} />
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