import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AppHome from "./pages/AppHome";
import AppContent from "./pages/AppContent";
import AppNutrition from "./pages/AppNutrition";
import AppProfile from "./pages/AppProfile";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminContent from "./pages/admin/AdminContent";
import AdminQuotes from "./pages/admin/AdminQuotes";
import NotFound from "./pages/NotFound";
import { BottomNav } from "./components/BottomNav";
import { AppHeader } from "./components/AppHeader";

const queryClient = new QueryClient();

function ProtectedRoute() {
  const { user, isLoading, isAdmin } = useAuth();

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

  if (isLoading) return null;
  
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
              <Route path="profile" element={<AppProfile />} />
            </Route>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="content" element={<AdminContent />} />
              <Route path="quotes" element={<AdminQuotes />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;