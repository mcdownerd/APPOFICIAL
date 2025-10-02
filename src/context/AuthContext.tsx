"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, UserRole, UserStatus } from "@/lib/types";
import { showError } from "@/utils/toast";
import { useTranslation } from "react-i18next";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isApproved: boolean;
  isPending: boolean;
  isRejected: boolean;
  isLoading: boolean;
  hasRole: (roles: UserRole[]) => boolean;
  isEstafeta: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  updateUserStatus: (userId: string, status: UserStatus) => Promise<void>;
  updateUserRole: (userId: string, role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const SessionContextProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApproved, setIsApproved] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    // Fetch initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user as User);
      }
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        const userProfile = await fetchUserProfile(session?.user?.id);
        setUser(userProfile);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsApproved(false);
        setIsPending(false);
        setIsRejected(false);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      updateAuthStatus(user);
    }
  }, [user]);

  const updateAuthStatus = useCallback((currentUser: User) => {
    switch (currentUser.status) {
      case UserStatus.ACTIVE:
        setIsApproved(true);
        setIsPending(false);
        setIsRejected(false);
        break;
      case UserStatus.PENDING:
        setIsApproved(false);
        setIsPending(true);
        setIsRejected(false);
        break;
      case UserStatus.REJECTED:
        setIsApproved(false);
        setIsPending(false);
        setIsRejected(true);
        break;
      default:
        setIsApproved(false);
        setIsPending(false);
        setIsRejected(false);
    }
  }, []);

  const fetchUserProfile = useCallback(async (userId: string): Promise<User> => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      showError(t("failedToLoadUserProfile"));
      throw error;
    }

    if (!data) {
      throw new Error(t("userNotFound"));
    }

    return data as User;
  }, [supabase, t]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error(t("loginFailed"));

      const userProfile = await fetchUserProfile(data.user.id);
      setUser(userProfile);
      updateAuthStatus(userProfile);
    } catch (error) {
      showError(t("loginFailed"));
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [supabase, fetchUserProfile, updateAuthStatus, t]);

  const signup = useCallback(async (email: string, password: string, fullName: string, role: UserRole) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error(t("registrationFailed"));

      // Insert user profile with pending status
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: data.user.id,
          email,
          full_name: fullName,
          role,
          status: UserStatus.PENDING, // Default to pending
        });

      if (profileError) throw profileError;

      showError(t("accountCreatedPending", { userName: fullName }));
    } catch (error) {
      showError(t("registrationFailed"));
      throw<dyad-problem-report summary="50 problems">
<problem file="src/context/AuthContext.tsx" line="4" column="45" code="2307">Cannot find module '@supabase/auth-helpers-nextjs' or its corresponding type declarations.</problem>
<problem file="src/pages/Index.tsx" line="24" column="34" code="2339">Property 'user_role' does not exist on type 'User'.</problem>
<problem file="src/pages/Login.tsx" line="23" column="30" code="2339">Property 'user_role' does not exist on type 'User'.</problem>
<problem file="src/pages/Login.tsx" line="24" column="30" code="2339">Property 'user_role' does not exist on type 'User'.</problem>
<problem file="src/pages/RegisterPage.tsx" line="25" column="30" code="2339">Property 'user_role' does not exist on type 'User'.</problem>
<problem file="src/pages/RegisterPage.tsx" line="26" column="30" code="2339">Property 'user_role' does not exist on type 'User'.</problem>
<problem file="src/components/Layout.tsx" line="86" column="36" code="2339">Property 'user_role' does not exist on type 'User'.</problem>
<problem file="src/components/Layout.tsx" line="132" column="25" code="2339">Property 'user_role' does not exist on type 'User'.</problem>
<problem file="src/components/Layout.tsx" line="151" column="36" code="2339">Property 'user_role' does not exist on type 'User'.</problem>
<problem file="src/components/Layout.tsx" line="156" column="34" code="2339">Property 'user_role' does not exist on type 'User'.</problem>
<problem file="src/components/AuthGuard.tsx" line="3" column="19" code="2459">Module '&quot;@/context/AuthContext&quot;' declares 'UserRole' locally, but it is not exported.</problem>
<problem file="src/components/AuthGuard.tsx" line="17" column="79" code="2339">Property 'user_role' does not exist on type 'User'.</problem>
<problem file="src/lib/api.ts" line="6" column="10" code="1205">Re-exporting a type when 'isolatedModules' is enabled requires using 'export type'.</problem>
<problem file="src/lib/api.ts" line="6" column="38" code="1205">Re-exporting a type when 'isolatedModules' is enabled requires using 'export type'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="7" column="11" code="2552">Cannot find name 'TicketAPI'. Did you mean 'ticketId'?</problem>
<problem file="src/pages/BalcaoPage.tsx" line="7" column="43" code="2304">Cannot find name 'user'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="8" column="5" code="2304">Cannot find name 'showSuccess'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="8" column="17" code="2304">Cannot find name 't'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="9" column="5" code="2304">Cannot find name 'fetchTickets'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="11" column="5" code="2304">Cannot find name 'showError'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="11" column="15" code="2304">Cannot find name 't'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="16" column="16" code="2304">Cannot find name 't'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="19" column="11" code="2304">Cannot find name 'TicketAPI'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="19" column="42" code="2304">Cannot find name 'user'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="20" column="5" code="2304">Cannot find name 'showSuccess'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="20" column="17" code="2304">Cannot find name 't'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="21" column="5" code="2304">Cannot find name 'fetchTickets'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="23" column="5" code="2304">Cannot find name 'showError'.</problem>
<problem file="src/pages/BalcaoPage.tsx" line="23" column="15" code="2304">Cannot find name 't'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="6" column="35" code="2304">Cannot find name 'useState'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="7" column="9" code="2304">Cannot find name 'subDays'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="16" column="17" code="2304">Cannot find name 'useTranslation'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="18" column="6" code="2304">Cannot find name 'Popover'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="19" column="8" code="2304">Cannot find name 'PopoverTrigger'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="20" column="10" code="2304">Cannot find name 'Button'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="21" column="12" code="2304">Cannot find name 'CalendarIcon'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="23" column="11" code="2304">Cannot find name 'Button'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="24" column="9" code="2304">Cannot find name 'PopoverTrigger'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="25" column="8" code="2304">Cannot find name 'PopoverContent'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="26" column="10" code="2304">Cannot find name 'Calendar'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="32" column="21" code="2304">Cannot find name 'subDays'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="34" column="9" code="2304">Cannot find name 'PopoverContent'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="35" column="7" code="2304">Cannot find name 'Popover'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="40" column="19" code="2304">Cannot find name 'startOfDay'.</problem>
<problem file="src/pages/AnaliseTempoPage.tsx" line="41" column="17" code="2304">Cannot find name 'endOfDay'.</problem>
<problem file="src/App.tsx" line="15" column="8" code="1192">Module '&quot;C:/Users/william/dyad-apps/MEU APP-copy/src/pages/BalcaoPage&quot;' has no default export.</problem>
<problem file="src/App.tsx" line="16" column="8" code="1192">Module '&quot;C:/Users/william/dyad-apps/MEU APP-copy/src/pages/HistoricoPage&quot;' has no default export.</problem>
<problem file="src/App.tsx" line="17" column="8" code="1192">Module '&quot;C:/Users/william/dyad-apps/MEU APP-copy/src/pages/AnaliseTempoPage&quot;' has no default export.</problem>
<problem file="src/App.tsx" line="18" column="8" code="1192">Module '&quot;C:/Users/william/dyad-apps/MEU APP-copy/src/pages/UserManagementPage&quot;' has no default export.</problem>
<problem file="src/App.tsx" line="39" column="24" code="2786">'EstafetaPage' cannot be used as a JSX component.
  Its type '() =&gt; void' is not a valid JSX element type.
    Type '() =&gt; void' is not assignable to type '(props: any, deprecatedLegacyContext?: any) =&gt; ReactNode'.
      Type 'void' is not assignable to type 'ReactNode'.</problem>
</dyad-problem-report><dyad-write path="src/lib/types.ts" description="Fix User interface: change user_role to role, ensure full_name, export types properly.">
export interface User {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  restaurant_id?: string;
  // Outros campos...
}

export type { User };

export enum UserRole {
  ADMIN = 'admin',
  RESTAURANTE = 'restaurante',
  ESTAFETA = 'estafeta',
}

export type { UserRole };

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
  INACTIVE = 'INACTIVE',
}

export type { UserStatus };

export interface Ticket {
  id: string;
  code: string;
  customer_name: string;
  delivery_address: string;
  estafeta_id?: string;
  restaurant_id?: string;
  created_by?: string;
  acknowledged_by?: string;
  deleted_by?: string;
  status: 'PENDING' | 'CONFIRMADO';
  created_date: string;
  acknowledged_at?: string;
  deleted_at?: string;
  soft_deleted?: boolean;
}

export type { Ticket };