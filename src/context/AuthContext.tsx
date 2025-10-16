import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, UserAPI, UserRole, UserStatus, signInWithPassword, signUp, signOut as supabaseSignOut } from "@/lib/api";
import { showSuccess, showError } from "@/utils/toast";
import { useTranslation } from "react-i18next";

export type { UserRole };

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isApproved: boolean;
  isPending: boolean;
  isRejected: boolean;
  isAdmin: boolean;
  isRestaurante: boolean;
  isEstafeta: boolean;
  isDashboardActivated: boolean; // Nova propriedade
  userDashboardAccessCode: string | null | undefined; // Nova propriedade
  hasRole: (roles: UserRole[]) => boolean;
  canAccess: (path: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const rolePaths: Record<UserRole, string[]> = {
  admin: ["/analise-tempo", "/balcao", "/estafeta", "/historico", "/admin/users", "/dashboard"], // Adicionado /dashboard
  restaurante: ["/balcao", "/historico", "/dashboard"], // Adicionado /dashboard
  estafeta: ["/estafeta", "/dashboard"], // Adicionado /dashboard
};

export const SessionContextProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start as true
  const { t } = useTranslation();

  const loadUser = useCallback(async (sessionUser: any, event?: string) => {
    console.log(`[AuthContext] loadUser called. Event: ${event}, SessionUser:`, sessionUser);
    setIsLoading(true); // Always set loading to true at the start of user loading attempt
    try {
      if (sessionUser) {
        const currentUser = await UserAPI.me();
        if (currentUser) {
          setUser(currentUser);
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            showSuccess(t("welcomeUser", { userName: currentUser.full_name }));
          }
          console.log("[AuthContext] User loaded:", currentUser);
        } else {
          setUser(null);
          showError(t("failedToLoadUserProfile"));
          console.warn("[AuthContext] Session user exists, but profile not found.");
        }
      } else {
        setUser(null);
        if (event === 'SIGNED_OUT') {
          showSuccess(t("sessionEnded"));
        }
        console.log("[AuthContext] No session user or signed out.");
      }
    } catch (error) {
      console.error("[AuthContext] Error fetching user profile or session:", error);
      showError(t("authErrorOccurred"));
      setUser(null);
    } finally {
      setIsLoading(false); // Ensure loading is set to false after user loading attempt
      console.log("[AuthContext] isLoading set to false.");
    }
  }, [t, showSuccess, showError]);

  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates on unmounted component

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      console.log("[AuthContext] Auth state change detected. Event:", event, "Session:", session);
      loadUser(session?.user, event);
    });

    return () => {
      isMounted = false; // Cleanup: set flag to false
      subscription.unsubscribe();
      console.log("[AuthContext] Auth state change subscription unsubscribed.");
    };
  }, [loadUser]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await UserAPI.login(email, password);
      // loadUser will be called by onAuthStateChange after successful login
    } catch (error) {
      showError(t("loginFailed"));
      throw error;
    } finally {
      // isLoading will be set by onAuthStateChange after login
    }
  };

  const register = async (fullName: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      await UserAPI.register(fullName, email, password);
      // loadUser will be called by onAuthStateChange after successful registration
    } catch (error: any) {
      if (error.message?.includes('already registered')) {
        showError(t("emailAlreadyExists"));
      } else {
        showError(t("registrationFailed"));
      }
      throw error;
    } finally {
      // isLoading will be set by onAuthStateChange after registration
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await supabaseSignOut();
      // loadUser will be called by onAuthStateChange after successful logout
    } catch (error) {
      showError(t("failedToLogout"));
      throw error;
    } finally {
      // isLoading will be set by onAuthStateChange after logout
    }
  };

  const isAuthenticated = !!user;
  const isApproved = user?.status === "APPROVED";
  const isPending = user?.status === "PENDING";
  const isRejected = user?.status === "REJECTED";

  const isAdmin = user?.user_role === "admin";
  const isRestaurante = user?.user_role === "restaurante";
  const isEstafeta = user?.user_role === "estafeta";
  const isDashboardActivated = isEstafeta ? !!user?.dashboard_activated_at : true; // Estafeta precisa de ativação

  const hasRole = useCallback(
    (roles: UserRole[]) => {
      return isAuthenticated && isApproved && user ? roles.includes(user.user_role) : false;
    },
    [user, isAuthenticated, isApproved],
  );

  const canAccess = useCallback(
    (path: string) => {
      if (!isAuthenticated || !isApproved || !user) return false;
      
      // Se for estafeta e tentar acessar o dashboard sem ativação, negar acesso
      if (user.user_role === "estafeta" && path === "/dashboard" && !user.dashboard_activated_at) {
        return false;
      }

      const allowedPaths = rolePaths[user.user_role as UserRole];
      return allowedPaths && allowedPaths.includes(path);
    },
    [user, isAuthenticated, isApproved],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        isAuthenticated,
        isApproved,
        isPending,
        isRejected,
        isAdmin,
        isRestaurante,
        isEstafeta,
        isDashboardActivated, // Nova propriedade
        userDashboardAccessCode: user?.dashboard_access_code, // Nova propriedade
        hasRole,
        canAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within a SessionContextProvider");
  }
  return context;
};