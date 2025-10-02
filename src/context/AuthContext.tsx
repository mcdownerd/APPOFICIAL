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
  hasRole: (roles: UserRole[]) => boolean;
  canAccess: (path: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const rolePaths: Record<UserRole, string[]> = {
  admin: ["/analise-tempo", "/balcao", "/estafeta", "/historico", "/admin/users"],
  restaurante: ["/balcao", "/historico"],
  estafeta: ["/estafeta"],
};

export const SessionContextProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start as true
  const { t } = useTranslation();

  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates on unmounted component

    const loadUser = async (sessionUser: any, event?: string) => {
      if (!isMounted) return;
      setIsLoading(true); // Set loading to true at the start of user loading attempt
      try {
        if (sessionUser) {
          const currentUser = await UserAPI.me();
          if (isMounted) {
            setUser(currentUser);
            if (currentUser && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
              showSuccess(t("welcomeUser", { userName: currentUser.full_name }));
            }
          }
        } else {
          if (isMounted) {
            setUser(null);
            if (event === 'SIGNED_OUT') {
              showSuccess(t("sessionEnded"));
            }
          }
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        if (isMounted) {
          showError(t("failedToLoadUserProfile"));
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false); // Ensure loading is set to false after user loading attempt
        }
      }
    };

    // Handle initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        loadUser(session?.user);
      }
    }).catch(error => {
      console.error("Error getting initial session:", error);
      if (isMounted) {
        showError(t("authErrorOccurred"));
        setUser(null);
        setIsLoading(false); // Ensure loading is false even if initial session fetch fails
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      loadUser(session?.user, event);
    });

    return () => {
      isMounted = false; // Cleanup: set flag to false
      subscription.unsubscribe();
    };
  }, [t]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await UserAPI.login(email, password);
    } catch (error) {
      showError(t("loginFailed"));
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (fullName: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      await UserAPI.register(fullName, email, password);
    } catch (error: any) {
      if (error.message?.includes('already registered')) {
        showError(t("emailAlreadyExists"));
      } else {
        showError(t("registrationFailed"));
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await supabaseSignOut();
    } catch (error) {
      showError(t("failedToLogout"));
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const isAuthenticated = !!user;
  const isApproved = user?.status === "APPROVED";
  const isPending = user?.status === "PENDING";
  const isRejected = user?.status === "REJECTED";

  const isAdmin = user?.user_role === "admin";
  const isRestaurante = user?.user_role === "restaurante";
  const isEstafeta = user?.user_role === "estafeta";

  const hasRole = useCallback(
    (roles: UserRole[]) => {
      return isAuthenticated && isApproved && user ? roles.includes(user.user_role) : false;
    },
    [user, isAuthenticated, isApproved],
  );

  const canAccess = useCallback(
    (path: string) => {
      if (!isAuthenticated || !isApproved || !user) return false;
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