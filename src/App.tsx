import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import RegisterPage from "./pages/RegisterPage";
import { SessionContextProvider } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";
import { Layout } from "./components/Layout";
import { AuthGuard } from "./components/AuthGuard";
import EstafetaPage from "./pages/EstafetaPage";
import BalcaoPage from "./pages/BalcaoPage";
import HistoricoPage from "./pages/HistoricoPage";
import AnaliseTempoPage from "./pages/AnaliseTempoPage";
import UserManagementPage from "./pages/UserManagementPage";
import DashboardPage from "./pages/DashboardPage";
import DashboardCopyPage from "./pages/DashboardCopyPage"; // Import the new page

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionContextProvider> {/* SessionContextProvider agora envolve SettingsProvider */}
          <SettingsProvider>
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
                    <AuthGuard allowedRoles={["admin"]}> {/* Apenas admin pode acessar o dashboard */}
                      <DashboardPage />
                    </AuthGuard>
                  }
                />
                {/* New route for the copied dashboard */}
                <Route
                  path="dashboard-copy"
                  element={
                    <AuthGuard allowedRoles={["admin", "restaurante", "estafeta"]} requiresRestaurantId={true}> {/* Adicionado requiresRestaurantId */}
                      <DashboardCopyPage />
                    </AuthGuard>
                  }
                />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </SettingsProvider>
        </SessionContextProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;