import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { useEffect } from "react";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}
import { initNotifications } from "@/lib/notifications";
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

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const queryClient = new QueryClient();

function ProtectedRouteInner() {
  const { user, isLoading, isAdmin } = useAuth();
  const { params, isVisible, minimize, end } = useActiveWorkout();

  useEffect(() => {
    if (user?.id) {
      initNotifications(user.id);
    }
  }, [user?.id]);

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

  return (
    <div className="min-h-screen bg-background">
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
  const { user, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    // Admin goes to admin dashboard, others go to app
    if (isAdmin) {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/app" replace />;
  }

  return <Auth />;
}

const App = () => (
  <ThemeProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthRoute />} />
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