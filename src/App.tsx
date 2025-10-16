import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import React, { Suspense } from "react"; // Import React and Suspense
import { SessionContextProvider } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";
import { Layout } from "./components/Layout";
import { AuthGuard } from "./components/AuthGuard";

// Lazy load pages
const Index = React.lazy(() => import("./pages/Index"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const Login = React.lazy(() => import("./pages/Login"));
const RegisterPage = React.lazy(() => import("./pages/RegisterPage"));
const EstafetaPage = React.lazy(() => import("./pages/EstafetaPage"));
const BalcaoPage = React.lazy(() => import("./pages/BalcaoPage"));
const HistoricoPage = React.lazy(() => import("./pages/HistoricoPage"));
const AnaliseTempoPage = React.lazy(() => import("./pages/AnaliseTempoPage"));
const UserManagementPage = React.lazy(() => import("./pages/UserManagementPage"));
const DashboardPage = React.lazy(() => import("./pages/DashboardPage"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionContextProvider>
          <SettingsProvider>
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-500 border-t-transparent"></div>
              </div>
            }>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/" element={<Layout />}>
                  <Route index element={<Index />} />
                  <Route
                    path="estafeta"
                    element={
                      <AuthGuard allowedRoles={["estafeta", "admin"]}>
                        <EstafetaPage />
                      </AuthGuard>
                    }
                  />
                  <Route
                    path="balcao"
                    element={
                      <AuthGuard allowedRoles={["restaurante", "admin"]}>
                        <BalcaoPage />
                      </AuthGuard>
                    }
                  />
                  <Route
                    path="historico"
                    element={
                      <AuthGuard allowedRoles={["restaurante", "admin"]}>
                        <HistoricoPage />
                      </AuthGuard>
                    }
                  />
                  <Route
                    path="analise-tempo"
                    element={
                      <AuthGuard allowedRoles={["admin", "restaurante"]}>
                        <AnaliseTempoPage />
                      </AuthGuard>
                    }
                  />
                  <Route
                    path="admin/users"
                    element={
                      <AuthGuard allowedRoles={["admin"]}>
                        <UserManagementPage />
                      </AuthGuard>
                    }
                  />
                  <Route
                    path="dashboard"
                    element={
                      <AuthGuard allowedRoles={["admin"]}>
                        <DashboardPage />
                      </AuthGuard>
                    }
                  />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </SettingsProvider>
        </SessionContextProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;