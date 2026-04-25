import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { useEffect } from "react";
import { initNotifications } from "@/lib/notifications";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AppHome from "./pages/AppHome";
import AppContent from "./pages/AppContent";
import AppNutrition from "./pages/AppNutrition";
import AppProfile from "./pages/AppProfile";
import AppTracker from "./pages/AppTracker";
import AppProgress from "./pages/AppProgress";
import AppWorkouts from "./pages/AppWorkouts";
import AppSettings from "./pages/AppSettings";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminContent from "./pages/admin/AdminContent";
import AdminQuotes from "./pages/admin/AdminQuotes";
import AdminHabits from "./pages/admin/AdminHabits";
import AdminSurveys from "./pages/admin/AdminSurveys";
import AdminExercises from "./pages/admin/AdminExercises";
import NotFound from "./pages/NotFound";
import { BottomNav } from "./components/BottomNav";
import { AppHeader } from "./components/AppHeader";

const queryClient = new QueryClient();

function ProtectedRoute() {
  const { user, isLoading, isAdmin } = useAuth();

  // Initialize push notifications once the user is known
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

  // Admin users get redirected to admin dashboard
  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <Outlet />
      <BottomNav />
    </div>
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
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
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
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;