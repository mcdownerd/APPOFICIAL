"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext"; // Import useAuth

interface SettingsContextType {
  isPendingLimitEnabled: boolean;
  togglePendingLimit: () => Promise<void>;
  isSettingsLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoading: isAuthLoading, isApproved } = useAuth();
  const [isPendingLimitEnabled, setIsPendingLimitEnabled] = useState<boolean>(true);
  const [isSettingsLoading, setIsSettingsLoading] = useState<boolean>(true);

  const restaurantId = user?.restaurant_id;
  const userRole = user?.user_role;

  // Fetch setting from database
  useEffect(() => {
    let isMounted = true;

    const fetchSetting = async () => {
      if (isAuthLoading || !isApproved) {
        // Wait for auth to load and user to be approved
        setIsSettingsLoading(true);
        return;
      }

      if (!restaurantId) {
        // If no restaurant_id, default to true or handle as needed
        if (isMounted) {
          setIsPendingLimitEnabled(true);
          setIsSettingsLoading(false);
        }
        return;
      }

      setIsSettingsLoading(true);
      try {
        const { data, error } = await supabase
          .from('restaurants')
          .select('pending_limit_enabled')
          .eq('id', restaurantId)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
          console.error("SettingsContext: Failed to fetch pending limit setting:", error);
          // Fallback to default or handle error
          if (isMounted) setIsPendingLimitEnabled(true);
        } else if (data) {
          if (isMounted) setIsPendingLimitEnabled(data.pending_limit_enabled);
        } else {
          // If no data (e.g., restaurant not found or no setting), default to true
          if (isMounted) setIsPendingLimitEnabled(true);
        }
      } catch (error) {
        console.error("SettingsContext: Error fetching pending limit setting:", error);
        if (isMounted) setIsPendingLimitEnabled(true); // Fallback on network error
      } finally {
        if (isMounted) setIsSettingsLoading(false);
      }
    };

    fetchSetting();

    return () => {
      isMounted = false;
    };
  }, [restaurantId, isAuthLoading, isApproved]);

  const togglePendingLimit = useCallback(async () => {
    if (!restaurantId || (userRole !== 'admin' && userRole !== 'restaurante')) {
      console.warn("SettingsContext: User not authorized or no restaurant_id to toggle setting.");
      return;
    }

    setIsSettingsLoading(true);
    const newValue = !isPendingLimitEnabled;
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ pending_limit_enabled: newValue })
        .eq('id', restaurantId);

      if (error) {
        console.error("SettingsContext: Failed to update pending limit setting:", error);
        throw new Error("Failed to update setting.");
      }

      setIsPendingLimitEnabled(newValue);
      console.log("SettingsContext: Updated pending_limit_enabled to", newValue);
    } catch (error) {
      console.error("SettingsContext: Error updating pending limit setting:", error);
      // Revert UI state if update fails
      setIsPendingLimitEnabled(!newValue);
      throw error;
    } finally {
      setIsSettingsLoading(false);
    }
  }, [isPendingLimitEnabled, restaurantId, userRole]);

  return (
    <SettingsContext.Provider value={{ isPendingLimitEnabled, togglePendingLimit, isSettingsLoading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};